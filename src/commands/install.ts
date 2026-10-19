import {confirm, input} from '@inquirer/prompts'
import {Command, Flags} from '@oclif/core'
import {randomBytes} from 'node:crypto'
import {chmod, copyFile, mkdir, readFile, rm, stat, writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

import {dockerInherit} from '../lib/docker.js'
import {buildEnvFile, resolveTerminalSshUser} from '../lib/install-env.js'
import {explicitOverrides, type InstallPlan, planInstall, wipeWarning} from '../lib/install-plan.js'
import {
  backupInstallFiles,
  backupStamp,
  chooseComposeFiles,
  composeArgs,
  composeDefaults,
  composeVariables,
  DIST_FILE,
  DOMAIN_FILE,
  mergeEnv,
  MissingSecretsError,
  OVERRIDE_FILE,
  parseEnv,
  repairDefaults,
  REQUIRED_SECRETS,
} from '../lib/reinstall.js'
import {stepLine, successLine, warnLine} from '../lib/style.js'
import {commandExists, detectPublicIp, dockerRunning, dockerSocketGid, isRoot, runShellInherit} from '../lib/system.js'
import {authorizeTerminalKey, skipReason} from '../lib/terminal-key.js'

const DOCKER_INSTALL_SCRIPT = 'curl -fsSL https://get.docker.com | sh'
/** How long to wait for the API to answer after `docker compose up -d` (migrations run on boot). */
const READY_TIMEOUT_MS = 120_000
const READY_POLL_MS = 2000

async function readIfExists(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return undefined
  }
}

export default class Install extends Command {
  static description = 'Install aoox (postgres + api + web) on a fresh VPS with Docker Compose'
  static examples = [
    'sudo <%= config.bin %> <%= command.id %>',
    'sudo <%= config.bin %> <%= command.id %> --web-domain panel.example.com --api-domain api.panel.example.com --acme-email me@example.com',
    'sudo <%= config.bin %> <%= command.id %> --force   # reinstall over an existing install, keeping data and secrets',
    'sudo <%= config.bin %> <%= command.id %> --force --new-secrets --wipe-data   # start from scratch (deletes all panel data)',
  ]
  static flags = {
    'acme-email': Flags.string({description: 'Required with --web-domain/--api-domain (Let’s Encrypt)'}),
    'admin-email': Flags.string({description: 'Create the first owner without going through /setup in the browser'}),
    'admin-name': Flags.string({dependsOn: ['admin-email'], description: 'Name of the first owner'}),
    'admin-password': Flags.string({dependsOn: ['admin-email'], description: 'Password of the first owner (min. 8 characters)'}),
    'api-domain': Flags.string({dependsOn: ['web-domain'], description: 'Domain for the API, served through the bundled proxy'}),
    'confirm-wipe': Flags.string({
      description: 'Non-interactive confirmation for --wipe-data: must be exactly the install directory (--yes alone is not enough)',
    }),
    dir: Flags.string({default: '/opt/aoox', description: 'Installation directory'}),
    force: Flags.boolean({
      default: false,
      description:
        'Reinstall over an existing installation in --dir: previous files are backed up to <dir>/backups/ and existing secrets and values are kept (data survives)',
    }),
    'new-secrets': Flags.boolean({
      default: false,
      description: 'Only with --force --wipe-data: generate new secrets for a completely fresh install (DELETES all panel data)',
    }),
    'no-terminal-authorize': Flags.boolean({
      default: false,
      description: 'Do not create/authorize the web Terminal SSH key automatically (do it in Settings > Terminal instead)',
    }),
    'terminal-ssh-user': Flags.string({
      description:
        'SSH user the web Terminal uses to log in to this host (default: the user running sudo, or root if there is none)',
    }),
    'web-domain': Flags.string({dependsOn: ['api-domain'], description: 'Domain for the web panel, served through the bundled proxy'}),
    'wipe-data': Flags.boolean({
      default: false,
      description:
        'Only with --force --new-secrets: run `docker compose down -v` first, removing the panel database volume (DELETES all panel data)',
    }),
    yes: Flags.boolean({char: 'y', default: false, description: 'Do not ask for any confirmation (does not confirm a wipe)'}),
  }

  // eslint-disable-next-line complexity -- linear orchestration: plan, confirm, backup, (wipe), write, up
  async run(): Promise<void> {
    const {flags} = await this.parse(Install)
    this.assertPreconditions(flags)

    const dir = resolve(flags.dir)
    const existingEnv = await readIfExists(`${dir}/.env.dist`)
    const existingCompose = await readIfExists(`${dir}/${DIST_FILE}`)
    const present = await this.presentFiles(dir)
    const plan = planInstall({
      composeExists: existingCompose !== undefined,
      confirmWipe: flags['confirm-wipe'] === undefined ? undefined : resolve(flags['confirm-wipe']),
      dir,
      envExists: existingEnv !== undefined,
      force: flags.force,
      hasSecrets: existingEnv !== undefined && REQUIRED_SECRETS.every((k) => Boolean(parseEnv(existingEnv).get(k))),
      interactive: Boolean(process.stdin.isTTY),
      newSecrets: flags['new-secrets'],
      wipeData: flags['wipe-data'],
      yes: flags.yes,
    })
    if (plan.kind === 'error') this.error(plan.message, {suggestions: plan.suggestions})

    await this.ensureDocker(flags.yes)
    await this.confirmPlan(plan, dir, flags.yes)

    // Never overwrite an existing install without a copy of what is being replaced.
    if (plan.kind !== 'fresh') {
      const backupDir = `${dir}/backups/${backupStamp()}`
      await backupInstallFiles(dir, backupDir, present)
      this.log(stepLine('Backed up the previous files to', backupDir))
    }

    if (plan.kind === 'wipe') await this.wipe(dir, present, existingEnv !== undefined)

    await mkdir(dir, {recursive: true})
    const assets = fileURLToPath(new URL('../../assets/install/', import.meta.url))
    await copyFile(`${assets}${DIST_FILE}`, `${dir}/${DIST_FILE}`)
    const domainMode = Boolean(flags['web-domain'])
    // A reinstall that keeps data also keeps (and refreshes) a domain compose file that is already there.
    const keepDomain = plan.kind === 'reuse' && present.has(DOMAIN_FILE)
    if (domainMode || keepDomain) await copyFile(`${assets}${DOMAIN_FILE}`, `${dir}/${DOMAIN_FILE}`)

    const secretsDir = `${dir}/secrets`
    await mkdir(secretsDir, {recursive: true})
    // The api container writes its terminal SSH key here as uid 1000 (the
    // `node` user) — chown it now so first use doesn't hit EACCES.
    await this.chownNode(secretsDir)

    let env: string
    let webOrigin: string
    if (plan.kind === 'reuse') {
      env = await this.reuseEnv(existingEnv ?? '', dir, assets, flags)
      const vars = parseEnv(env)
      webOrigin = vars.get('WEB_ORIGIN') || `http://localhost:${vars.get('WEB_PORT') || '3000'}`
    } else {
      this.log(stepLine('Detecting the server public IP'))
      const publicIp = await detectPublicIp()
      webOrigin = domainMode ? `https://${flags['web-domain']}` : `http://${publicIp ?? 'localhost'}:3000`
      const publicApiUrl = domainMode ? `https://${flags['api-domain']}` : `http://${publicIp ?? 'localhost'}:3001`
      env = buildEnvFile({
        acmeEmail: flags['acme-email'],
        adminEmail: flags['admin-email'],
        adminName: flags['admin-name'],
        adminPassword: flags['admin-password'],
        apiDomain: flags['api-domain'],
        dockerGid: dockerSocketGid(),
        encryptionKey: randomBytes(32).toString('hex'),
        installDir: dir,
        jwtSecret: randomBytes(32).toString('hex'),
        postgresPassword: randomBytes(24).toString('hex'),
        publicApiUrl,
        publicIp,
        terminalSshUser: resolveTerminalSshUser(flags['terminal-ssh-user'], process.env),
        webDomain: flags['web-domain'],
        webOrigin,
      })
    }

    await writeFile(`${dir}/.env.dist`, env, {mode: 0o600})
    await chmod(`${dir}/.env.dist`, 0o600)
    this.authorizeTerminal(dir, env, flags['no-terminal-authorize'])

    this.log(stepLine('Running docker compose up -d'))
    let files = [DIST_FILE]
    if (plan.kind === 'reuse') files = chooseComposeFiles({present: await this.presentFiles(dir)})
    else if (domainMode) files = [DIST_FILE, DOMAIN_FILE]
    await dockerInherit(composeArgs(files, 'up', '-d'), dir)

    this.log(stepLine('Waiting for the API to be ready'))
    await this.waitReady()

    this.log('')
    this.log(successLine(`aoox is installed in ${dir}.`))
    this.log(`Open: ${webOrigin}`)
    if (plan.kind === 'reuse') {
      this.log('Existing data and secrets were kept. The previous files are in the backups folder of the install directory.')
    } else if (!flags['admin-email']) {
      this.log('Create the first owner account at /setup.')
    }
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
      if (optOut) this.log(stepLine(`Terminal: key was not authorized automatically (${reason}).`))
      return
    }

    this.log(stepLine('Preparing the SSH key for the web Terminal'))
    const outcome = authorizeTerminalKey({installDir: resolve(dir), user: vars.get('TERMINAL_SSH_USER')!})
    if (outcome.ok) this.log(outcome.message)
    else this.logToStderr(warnLine(outcome.message))
  }

  /** `numeric:numeric` works even without a matching /etc/passwd entry on the host. */
  private async chownNode(dir: string): Promise<void> {
    try {
      await import('node:child_process').then(({execFileSync}) => execFileSync('chown', ['1000:1000', dir]))
    } catch (error) {
      this.logToStderr(warnLine(`Cannot chown ${dir} (${String(error)}) — the web terminal may need this done manually later.`))
    }
  }

  private async confirmPlan(plan: InstallPlan, dir: string, yes: boolean): Promise<void> {
    if (plan.kind === 'wipe') {
      for (const line of wipeWarning(dir)) this.logToStderr(warnLine(line))
      if (plan.confirm === 'typed') {
        const typed = await input({message: `Type the install directory (${dir}) to confirm that all panel data is deleted:`})
        if (resolve(typed.trim()) !== dir) this.error('The typed path does not match — nothing was changed.')
      }

      return
    }

    if (plan.kind === 'reuse') {
      this.logToStderr(warnLine(
        `--force reinstalls over the existing installation in ${dir}: the previous files are backed up first and existing secrets and values are kept, so your data stays readable.`,
      ))
      if (yes) return
      const ok = await confirm({default: true, message: `Reinstall in ${dir} (data and secrets are kept) and run docker compose up -d?`})
      if (!ok) this.exit(0)
      return
    }

    if (yes) return
    const ok = await confirm({default: true, message: `Install aoox in ${dir} and run docker compose up -d?`})
    if (!ok) this.exit(0)
  }

  private async ensureDocker(yes: boolean): Promise<void> {
    if (commandExists('docker') && dockerRunning()) return
    this.log('Docker is not installed or not running yet.')
    if (!yes) {
      const ok = await confirm({default: true, message: `Install Docker now via ${DOCKER_INSTALL_SCRIPT}?`})
      if (!ok) this.error('Docker is required to continue.')
    }

    this.log(stepLine(`${DOCKER_INSTALL_SCRIPT}`))
    await runShellInherit(DOCKER_INSTALL_SCRIPT)
    if (!(commandExists('docker') && dockerRunning())) {
      this.error('Docker still cannot be started after installation.', {
        suggestions: ['Check `systemctl status docker`, then run aoox install again.'],
      })
    }
  }

  private async presentFiles(dir: string): Promise<Set<string>> {
    const found = new Set<string>()
    for (const name of [DIST_FILE, DOMAIN_FILE, OVERRIDE_FILE]) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await stat(`${dir}/${name}`)
        found.add(name)
      } catch {
        /* absent */
      }
    }

    return found
  }

  /** Reuse mode: the existing `.env.dist` is merged, never regenerated; only explicit flags replace values. */
  private async reuseEnv(existing: string, dir: string, assets: string, flags: Record<string, unknown>): Promise<string> {
    const dist = await readFile(`${assets}${DIST_FILE}`, 'utf8')
    const domain = await readIfExists(`${dir}/${DOMAIN_FILE}`)
    try {
      const defaults = repairDefaults(
        composeVariables(dist, domain ?? ''),
        {dockerGid: dockerSocketGid(), installDir: dir},
        composeDefaults(dist, domain ?? ''),
      )
      const overrides = explicitOverrides({
        acmeEmail: flags['acme-email'] as string | undefined,
        adminEmail: flags['admin-email'] as string | undefined,
        adminName: flags['admin-name'] as string | undefined,
        adminPassword: flags['admin-password'] as string | undefined,
        apiDomain: flags['api-domain'] as string | undefined,
        terminalSshUser: flags['terminal-ssh-user'] as string | undefined,
        webDomain: flags['web-domain'] as string | undefined,
      })
      const merged = mergeEnv(existing, defaults, overrides)
      for (const w of merged.warnings) this.logToStderr(warnLine(w))
      return merged.content
    } catch (error) {
      if (error instanceof MissingSecretsError) this.error(error.message)
      throw error
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
      this.logToStderr(warnLine('The API did not respond in the expected time — check `docker compose logs api` in the installation directory.'))
      return
    }

    await new Promise((resolve) => {
      setTimeout(resolve, READY_POLL_MS)
    })
    return this.waitReady(deadline)
  }

  /** `docker compose down -v` for the existing stack (dist + domain file only: the override just changes ports/labels). */
  private async wipe(dir: string, present: Set<string>, hasEnv: boolean): Promise<void> {
    this.log(stepLine('Removing the existing stack and its volumes (docker compose down -v)'))
    if (present.has(DIST_FILE)) {
      const files = [DIST_FILE, ...(present.has(DOMAIN_FILE) ? [DOMAIN_FILE] : [])]
      // Without a .env.dist the required secrets cannot be interpolated: placeholders are enough to remove the stack.
      await (hasEnv
        ? dockerInherit(composeArgs(files, 'down', '-v', '--remove-orphans'), dir)
        : dockerInherit(['compose', ...files.flatMap((f) => ['-f', f]), 'down', '-v', '--remove-orphans'], dir, {
            JWT_SECRET: 'x',
            POSTGRES_PASSWORD: 'x',
          }))
    }

    // Settings of the wiped database no longer exist; the backup keeps the old copies.
    await rm(`${dir}/${OVERRIDE_FILE}`, {force: true})
    await rm(`${dir}/${DOMAIN_FILE}`, {force: true})
  }
}
