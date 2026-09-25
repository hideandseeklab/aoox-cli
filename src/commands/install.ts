import {confirm} from '@inquirer/prompts'
import {Command, Flags} from '@oclif/core'
import {randomBytes} from 'node:crypto'
import {copyFile, mkdir, stat, writeFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'

import {dockerInherit} from '../lib/docker.js'
import {buildEnvFile} from '../lib/install-env.js'
import {commandExists, detectPublicIp, dockerRunning, dockerSocketGid, isRoot, runShellInherit} from '../lib/system.js'

const DOCKER_INSTALL_SCRIPT = 'curl -fsSL https://get.docker.com | sh'
/** How long to wait for the API to answer after `docker compose up -d` (migrations run on boot). */
const READY_TIMEOUT_MS = 120_000
const READY_POLL_MS = 2000

export default class Install extends Command {
  static description = 'Pasang aoox (postgres + api + web) di VPS baru lewat Docker Compose'
  static examples = [
    'sudo <%= config.bin %> <%= command.id %>',
    'sudo <%= config.bin %> <%= command.id %> --web-domain panel.example.com --api-domain api.panel.example.com --acme-email me@example.com',
  ]
  static flags = {
    'acme-email': Flags.string({description: 'Wajib bersama --web-domain/--api-domain (Let’s Encrypt)'}),
    'admin-email': Flags.string({description: 'Buat owner pertama tanpa lewat /setup di browser'}),
    'admin-name': Flags.string({dependsOn: ['admin-email'], description: 'Nama owner pertama'}),
    'admin-password': Flags.string({dependsOn: ['admin-email'], description: 'Password owner pertama (min. 8 karakter)'}),
    'api-domain': Flags.string({dependsOn: ['web-domain'], description: 'Domain untuk API, lewat proxy bawaan'}),
    dir: Flags.string({default: '/opt/aoox', description: 'Folder instalasi'}),
    force: Flags.boolean({default: false, description: 'Timpa instalasi yang sudah ada di --dir'}),
    'web-domain': Flags.string({dependsOn: ['api-domain'], description: 'Domain untuk panel web, lewat proxy bawaan'}),
    yes: Flags.boolean({char: 'y', default: false, description: 'Jangan tanya konfirmasi apa pun'}),
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

    this.log('==> Mendeteksi IP publik server')
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
      jwtSecret: randomBytes(32).toString('hex'),
      postgresPassword: randomBytes(24).toString('hex'),
      publicApiUrl,
      publicIp,
      webDomain: flags['web-domain'],
      webOrigin,
    })
    await writeFile(`${dir}/.env.dist`, env, {mode: 0o600})

    this.log('==> Menjalankan docker compose up -d')
    const composeArgs = ['compose', '-f', 'docker-compose.dist.yml']
    if (domainMode) composeArgs.push('-f', 'docker-compose.domain.yml')
    composeArgs.push('--env-file', '.env.dist', 'up', '-d')
    await dockerInherit(composeArgs, dir)

    this.log('==> Menunggu API siap')
    await this.waitReady()

    this.log('')
    this.log(`aoox terpasang di ${dir}.`)
    this.log(`Buka: ${webOrigin}`)
    if (!flags['admin-email']) this.log('Buat akun owner pertama di /setup.')
  }

  private assertPreconditions(flags: {'acme-email'?: string; 'api-domain'?: string; 'web-domain'?: string}): void {
    if (process.platform !== 'linux') {
      this.error('aoox install hanya untuk VPS Linux (dijalankan langsung di server tujuan).')
    }

    if (!isRoot()) {
      this.error('Perlu root — instalasi menulis ke path sistem dan mengelola Docker.', {
        suggestions: ['sudo aoox install …'],
      })
    }

    if (flags['web-domain'] && !flags['acme-email']) {
      this.error('--web-domain/--api-domain butuh --acme-email (sertifikat Let’s Encrypt untuk domain itu).')
    }
  }

  /** `numeric:numeric` works even without a matching /etc/passwd entry on the host. */
  private async chownNode(dir: string): Promise<void> {
    try {
      await import('node:child_process').then(({execFileSync}) => execFileSync('chown', ['1000:1000', dir]))
    } catch (error) {
      this.warn(`Tidak bisa chown ${dir} (${String(error)}) — terminal web mungkin perlu ini manual nanti.`)
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
      this.error(`Sudah ada instalasi di ${dir}.`, {suggestions: ['Beri --force untuk menimpanya.']})
    }

    if (flags.yes) return
    const ok = await confirm({
      default: true,
      message: `Pasang aoox di ${dir}${exists ? ' (menimpa yang ada)' : ''} dan jalankan docker compose up -d?`,
    })
    if (!ok) this.exit(0)
  }

  private async ensureDocker(yes: boolean): Promise<void> {
    if (commandExists('docker') && dockerRunning()) return
    this.log('Docker belum terpasang/berjalan.')
    if (!yes) {
      const ok = await confirm({default: true, message: `Pasang Docker sekarang lewat ${DOCKER_INSTALL_SCRIPT}?`})
      if (!ok) this.error('Docker diperlukan untuk melanjutkan.')
    }

    this.log(`==> ${DOCKER_INSTALL_SCRIPT}`)
    await runShellInherit(DOCKER_INSTALL_SCRIPT)
    if (!(commandExists('docker') && dockerRunning())) {
      this.error('Docker masih belum bisa dijalankan setelah instalasi.', {
        suggestions: ['Cek `systemctl status docker`, lalu jalankan aoox install lagi.'],
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
      this.warn('API belum menjawab dalam waktu yang diharapkan — cek `docker compose logs api` di folder instalasi.')
      return
    }

    await new Promise((resolve) => {
      setTimeout(resolve, READY_POLL_MS)
    })
    return this.waitReady(deadline)
  }
}
