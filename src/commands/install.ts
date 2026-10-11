import {confirm} from '@inquirer/prompts'
import {Command, Flags} from '@oclif/core'
import {randomBytes} from 'node:crypto'
import {copyFile, mkdir, readFile, stat, writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

import {dockerInherit} from '../lib/docker.js'
import {buildEnvFile, resolveTerminalSshUser} from '../lib/install-env.js'
import {parseEnv} from '../lib/reinstall.js'
import {commandExists, detectPublicIp, dockerRunning, dockerSocketGid, isRoot, runShellInherit} from '../lib/system.js'
import {authorizeTerminalKey, skipReason} from '../lib/terminal-key.js'

const DOCKER_INSTALL_SCRIPT = 'curl -fsSL https://get.docker.com | sh'
/** How long to wait for the API to answer after `docker compose up -d` (migrations run on boot). */
const READY_TIMEOUT_MS = 120_000
const READY_POLL_MS = 2000

export default class Install extends Command {
  static description = 'Install aoox (postgres + api + web) on a fresh VPS with Docker Compose'
  static examples = [
    'sudo <%= config.bin %> <%= command.id %>',
    'sudo <%= config.bin %> <%= command.id %> --web-domain panel.example.com --api-domain api.panel.example.com --acme-email me@example.com',
  ]
  static flags = {
    'acme-email': Flags.string({description: 'Required with --web-domain/--api-domain (Let’s Encrypt)'}),
    'admin-email': Flags.string({description: 'Create the first owner without going through /setup in the browser'}),
    'admin-name': Flags.string({dependsOn: ['admin-email'], description: 'Name of the first owner'}),
    'admin-password': Flags.string({dependsOn: ['admin-email'], description: 'Password of the first owner (min. 8 characters)'}),
    'api-domain': Flags.string({dependsOn: ['web-domain'], description: 'Domain for the API, served through the bundled proxy'}),
    dir: Flags.string({default: '/opt/aoox', description: 'Installation directory'}),
    force: Flags.boolean({default: false, description: 'Overwrite an existing installation in --dir'}),
    'no-terminal-authorize': Flags.boolean({
      default: false,
      description: 'Do not create/authorize the web Terminal SSH key automatically (do it in Settings > Terminal instead)',
    }),
    'terminal-ssh-user': Flags.string({
      description:
        'SSH user the web Terminal uses to log in to this host (default: the user running sudo, or root if there is none)',
    }),
    'web-domain': Flags.string({dependsOn: ['api-domain'], description: 'Domain for the web panel, served through the bundled proxy'}),
    yes: Flags.boolean({char: 'y', default: false, description: 'Do not ask for any confirmation'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Install)
    this.assertPreconditions(flags)

    await this.ensureDocker(flags.yes)

    const {dir} = flags
    await this.confirmPlan(dir, flags)
    await mkdir(dir, {recursive: true})
    const assets = fileURLToPath(new URL('../../assets/install/', import.meta.url))
    await copyFile(`${assets}docker-compose.dist.yml`, `${dir}/docker-compose.dist.yml`)
    const domainMode = Boolean(flags['web-domain'])
    if (domainMode) await copyFile(`${assets}docker-compose.domain.yml`, `${dir}/docker-compose.domain.yml`)

    const secretsDir = `${dir}/secrets`
    await mkdir(secretsDir, {recursive: true})
    // The api container writes its terminal SSH key here as uid 1000 (the
    // `node` user) — chown it now so first use doesn't hit EACCES.
    await this.chownNode(secretsDir)

    this.log('==> Detecting the server public IP')
    const publicIp = await detectPublicIp()
    const webOrigin = domainMode ? `https://${flags['web-domain']}` : `http://${publicIp ?? 'localhost'}:3000`
    const publicApiUrl = domainMode ? `https://${flags['api-domain']}` : `http://${publicIp ?? 'localhost'}:3001`

    const env = buildEnvFile({
      acmeEmail: flags['acme-email'],
      adminEmail: flags['admin-email'],
      adminName: flags['admin-name'],
      adminPassword: flags['admin-password'],
      apiDomain: flags['api-domain'],
      dockerGid: dockerSocketGid(),
      encryptionKey: randomBytes(32).toString('hex'),
      installDir: resolve(dir),
      jwtSecret: randomBytes(32).toString('hex'),
      postgresPassword: randomBytes(24).toString('hex'),
      publicApiUrl,
      publicIp,
      terminalSshUser: resolveTerminalSshUser(flags['terminal-ssh-user'], process.env),
      webDomain: flags['web-domain'],
      webOrigin,
    })
    await writeFile(`${dir}/.env.dist`, env, {mode: 0o600})
    this.authorizeTerminal(dir, env, flags['no-terminal-authorize'])

    this.log('==> Running docker compose up -d')
    const composeArgs = ['compose', '-f', 'docker-compose.dist.yml']
    if (domainMode) composeArgs.push('-f', 'docker-compose.domain.yml')
    composeArgs.push('--env-file', '.env.dist', 'up', '-d')
    await dockerInherit(composeArgs, dir)

    this.log('==> Waiting for the API to be ready')
    await this.waitReady()

    this.log('')
    this.log(`aoox is installed in ${dir}.`)
    this.log(`Open: ${webOrigin}`)
    if (!flags['admin-email']) this.log('Create the first owner account at /setup.')
  }

  private assertPreconditions(flags: {'acme-email'?: string; 'api-domain'?: string; 'web-domain'?: string}): void {
    if (process.platform !== 'linux') {
      this.error('aoox install only runs on a Linux VPS (run it directly on the target server).')
    }

    if (!isRoot()) {
      this.error('Root is required — the installer writes to system paths and manages Docker.', {
        suggestions: ['sudo aoox install …'],
      })
    }

    if (flags['web-domain'] && !flags['acme-email']) {
      this.error('--web-domain/--api-domain requires --acme-email (Let’s Encrypt certificate for those domains).')
    }
  }

  /** Never fails the install: a problem becomes a warning (the Settings button is the fallback). */
  private authorizeTerminal(dir: string, envFile: string, optOut: boolean): void {
    const vars = parseEnv(envFile)
    const reason = skipReason({
      explicitCredential: Boolean(vars.get('TERMINAL_SSH_PRIVATE_KEY_FILE') || vars.get('TERMINAL_SSH_PASSWORD')),
      noAuthorize: optOut,
      platform: process.platform,
      root: isRoot(),
      user: vars.get('TERMINAL_SSH_USER'),
    })
    if (reason) {
      if (optOut) this.log(`==> Terminal: key was not authorized automatically (${reason}).`)
      return
    }

    this.log('==> Preparing the SSH key for the web Terminal')
    const outcome = authorizeTerminalKey({installDir: resolve(dir), user: vars.get('TERMINAL_SSH_USER')!})
    if (outcome.ok) this.log(outcome.message)
    else this.warn(outcome.message)
  }

  /** `numeric:numeric` works even without a matching /etc/passwd entry on the host. */
  private async chownNode(dir: string): Promise<void> {
    try {
      await import('node:child_process').then(({execFileSync}) => execFileSync('chown', ['1000:1000', dir]))
    } catch (error) {
      this.warn(`Cannot chown ${dir} (${String(error)}) — the web terminal may need this done manually later.`)
    }
  }

  private async confirmPlan(dir: string, flags: {force: boolean; yes: boolean}): Promise<void> {
    let exists = false
    try {
      await stat(`${dir}/docker-compose.dist.yml`)
      exists = true
    } catch {
      /* not installed yet, as expected */
    }

    if (exists && !flags.force) {
      this.error(`An installation already exists in ${dir}.`, {suggestions: [
          'To repair/refresh the existing installation without losing data: `sudo aoox reinstall`.',
          'Use --force only for a clean reinstall from scratch — it creates new secrets and cuts off access to the existing data.',
        ],
      })
    }

    let hasSecrets = false
    if (exists) {
      try {
        hasSecrets = /^\s*(POSTGRES_PASSWORD|JWT_SECRET|ENCRYPTION_KEY)=\S/m.test(await readFile(`${dir}/.env.dist`, 'utf8'))
      } catch {
        /* no .env.dist — nothing to overwrite */
      }
    }

    if (hasSecrets) {
      this.warn(
        `--force OVERWRITES ${dir}/.env.dist with new random secrets (POSTGRES_PASSWORD, JWT_SECRET, ENCRYPTION_KEY): ` +
          'the existing database can no longer be accessed and all stored credentials (registry, git, S3, notifications, 2FA) can no longer be decrypted. ' +
          'To repair the existing installation without losing data, cancel and run `sudo aoox reinstall`.',
      )
    }

    if (flags.yes) return
    const ok = await confirm({
      default: !hasSecrets,
      message: hasSecrets
        ? `Still overwrite .env.dist and create new secrets in ${dir} (the existing data will not be readable)?`
        : `Install aoox in ${dir}${exists ? ' (overwriting the existing one)' : ''} and run docker compose up -d?`,
    })
    if (!ok) this.exit(0)
  }

  private async ensureDocker(yes: boolean): Promise<void> {
    if (commandExists('docker') && dockerRunning()) return
    this.log('Docker is not installed or not running yet.')
    if (!yes) {
      const ok = await confirm({default: true, message: `Install Docker now via ${DOCKER_INSTALL_SCRIPT}?`})
      if (!ok) this.error('Docker is required to continue.')
    }

    this.log(`==> ${DOCKER_INSTALL_SCRIPT}`)
    await runShellInherit(DOCKER_INSTALL_SCRIPT)
    if (!(commandExists('docker') && dockerRunning())) {
      this.error('Docker still cannot be started after installation.', {
        suggestions: ['Check `systemctl status docker`, then run aoox install again.'],
      })
    }
  }

  /** Polls the API's own setup-status endpoint — migrations run on boot, so "up" isn't "ready". */
  private async waitReady(deadline = Date.now() + READY_TIMEOUT_MS): Promise<void> {
    try {
      const res = await fetch('http://localhost:3001/auth/setup-status', {signal: AbortSignal.timeout(3000)})
      if (res.ok) return
    } catch {
      /* API not answering yet */
    }

    if (Date.now() >= deadline) {
      this.warn('The API did not respond in the expected time — check `docker compose logs api` in the installation directory.')
      return
    }

    await new Promise((resolve) => {
      setTimeout(resolve, READY_POLL_MS)
    })
    return this.waitReady(deadline)
  }
}
