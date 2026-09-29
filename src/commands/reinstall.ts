import {confirm} from '@inquirer/prompts'
import {Command, Flags} from '@oclif/core'
import {chmod, copyFile, mkdir, readFile, rename, stat, writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

import {dockerCapture, dockerInherit} from '../lib/docker.js'
import {
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
  runningFileNames,
  summarizeDiff,
} from '../lib/reinstall.js'
import {commandExists, dockerRunning, dockerSocketGid, isRoot, waitForApi} from '../lib/system.js'

const READY_TIMEOUT_MS = 120_000

async function readIfExists(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return undefined
  }
}

export default class Reinstall extends Command {
  static description =
    'Perbaiki/segarkan instalasi aoox yang sudah ada tanpa kehilangan data: tulis ulang compose, gabungkan .env.dist (secret tidak pernah dibuat ulang), lalu pull + recreate'
  static examples = [
    'sudo <%= config.bin %> <%= command.id %> --dry-run',
    'sudo <%= config.bin %> <%= command.id %>',
    'sudo <%= config.bin %> <%= command.id %> --yes --terminal-ssh-user root',
  ]
  static flags = {
    dir: Flags.string({default: '/opt/aoox', description: 'Folder instalasi'}),
    'dry-run': Flags.boolean({default: false, description: 'Cetak rencana (file yang berubah, key yang ditambah, perintah compose) tanpa mengubah apa pun'}),
    'no-pull': Flags.boolean({default: false, description: 'Lewati docker compose pull (pakai image yang sudah ada)'}),
    'terminal-ssh-user': Flags.string({description: 'Isi/timpa TERMINAL_SSH_USER di .env.dist saat repair'}),
    yes: Flags.boolean({char: 'y', default: false, description: 'Jangan tanya konfirmasi'}),
  }

  // eslint-disable-next-line complexity -- linear orchestration: plan, confirm, backup, apply, report
  async run(): Promise<void> {
    const {flags} = await this.parse(Reinstall)
    const dir = resolve(flags.dir)

    this.assertPreconditions()

    const envPath = `${dir}/.env.dist`
    const currentEnv = await readIfExists(envPath)
    const currentCompose = await readIfExists(`${dir}/${DIST_FILE}`)
    if (currentEnv === undefined || currentCompose === undefined) {
      this.error(`Tidak ada instalasi aoox di ${dir} (${DIST_FILE} dan .env.dist harus ada).`, {
        suggestions: ['Untuk instalasi baru: `sudo aoox install`. Folder lain: --dir <folder>.'],
      })
    }

    const assets = fileURLToPath(new URL('../../assets/install/', import.meta.url))
    const newCompose = await readFile(`${assets}${DIST_FILE}`, 'utf8')
    const currentDomain = await readIfExists(`${dir}/${DOMAIN_FILE}`)
    const newDomain = currentDomain === undefined ? undefined : await readFile(`${assets}${DOMAIN_FILE}`, 'utf8')

    let merge: ReturnType<typeof mergeEnv>
    try {
      const vars = composeVariables(newCompose, newDomain ?? '')
      const defaults = repairDefaults(vars, {dockerGid: dockerSocketGid(), installDir: dir}, composeDefaults(newCompose, newDomain ?? ''))
      merge = mergeEnv(
        currentEnv,
        defaults,
        flags['terminal-ssh-user'] ? {TERMINAL_SSH_USER: flags['terminal-ssh-user']} : {},
      )
    } catch (error) {
      if (error instanceof MissingSecretsError) this.error(error.message)
      throw error
    }

    const running = await this.runningStack(dir)
    const present = await this.presentFiles(dir, runningFileNames(running))
    const files = chooseComposeFiles({present, runningConfigFiles: running})
    const pull = flags['no-pull'] ? undefined : composeArgs(files, 'pull')
    const up = composeArgs(files, 'up', '-d', '--force-recreate')

    const composeChanged = newCompose !== currentCompose
    const domainChanged = newDomain !== undefined && newDomain !== currentDomain
    const envChanged = merge.content !== currentEnv
    const anyChange = composeChanged || domainChanged || envChanged

    this.printPlan({
      composeDiff: composeChanged ? summarizeDiff(currentCompose, newCompose) : undefined,
      dir,
      domainDiff: domainChanged ? summarizeDiff(currentDomain ?? '', newDomain ?? '') : undefined,
      files,
      merge,
      pull,
      running,
      up,
    })

    if (flags['dry-run']) {
      this.log('\n(dry-run) Tidak ada yang diubah.')
      return
    }

    await this.ensureDocker()

    if (!flags.yes) {
      const ok = await confirm({
        default: true,
        message: `Terapkan di ${dir} (data & secret tidak disentuh) lalu recreate container?`,
      })
      if (!ok) this.exit(0)
    }

    let backupDir: string | undefined
    if (anyChange) {
      backupDir = `${dir}/backups/${backupStamp()}`
      await this.backup(dir, backupDir, present)
      if (composeChanged) await this.atomicWrite(`${dir}/${DIST_FILE}`, newCompose, 0o644)
      if (domainChanged && newDomain !== undefined) await this.atomicWrite(`${dir}/${DOMAIN_FILE}`, newDomain, 0o644)
      if (envChanged) await this.atomicWrite(envPath, merge.content, 0o600)
    }

    if (pull) {
      this.log('==> docker compose pull')
      await dockerInherit(pull, dir)
    }

    this.log('==> docker compose up -d --force-recreate')
    await dockerInherit(up, dir)

    const env = parseEnv(merge.content)
    this.log('==> Menunggu API siap')
    const ready = await waitForApi(env.get('API_PORT') || '3001', READY_TIMEOUT_MS)
    if (!ready) this.warn(`API belum menjawab dalam waktu yang diharapkan — cek \`docker compose ${files.map((f) => `-f ${f}`).join(' ')} logs api\` di ${dir}.`)

    const version = await dockerCapture(
      [...composeArgs(files, 'exec', '-T', 'api', 'node', '-p', "require('./package.json').version")],
      dir,
    )

    this.log('')
    this.log(`Selesai. aoox di ${dir} disegarkan${version ? ` (versi ${version})` : ''}.`)
    this.log(`  Key .env.dist ditambahkan: ${merge.added.length > 0 ? merge.added.join(', ') : '(tidak ada)'}`)
    this.log(`  Backup file lama: ${backupDir ?? '(tidak ada perubahan file, tidak perlu backup)'}`)
    this.log(`  Buka: ${env.get('WEB_ORIGIN') || 'http://localhost:3000'}`)
  }

  private assertPreconditions(): void {
    if (process.platform !== 'linux') {
      this.error('aoox reinstall hanya untuk VPS Linux (dijalankan langsung di server tujuan).')
    }

    if (!isRoot()) {
      this.error('Perlu root — perintah ini membaca .env.dist (izin 600) dan mengelola Docker.', {
        suggestions: [
          'sudo aoox reinstall …',
          'Kalau `sudo: aoox: command not found` (terpasang di ~/.local/bin): sudo "$(command -v aoox)" reinstall …',
        ],
      })
    }
  }

  private async atomicWrite(path: string, content: string, mode: number): Promise<void> {
    const tmp = `${path}.tmp-${process.pid}`
    await writeFile(tmp, content, {mode})
    await rename(tmp, path)
  }

  private async backup(dir: string, backupDir: string, present: Set<string>): Promise<void> {
    await mkdir(backupDir, {mode: 0o700, recursive: true})
    for (const name of ['.env.dist', ...present]) {
      const src = `${dir}/${name}`
      // eslint-disable-next-line no-await-in-loop
      await copyFile(src, `${backupDir}/${name}`)
      // .env.dist holds the secrets — the copy must be just as private.
      // eslint-disable-next-line no-await-in-loop
      if (name === '.env.dist') await chmod(`${backupDir}/${name}`, 0o600)
    }

    this.log(`==> Backup file lama ke ${backupDir}`)
  }

  private async ensureDocker(): Promise<void> {
    if (!commandExists('docker') || !dockerRunning()) {
      this.error('Docker tidak ditemukan atau tidak berjalan (atau tidak ada akses ke socket-nya).', {
        suggestions: ['Jalankan dengan sudo, dan pastikan `systemctl status docker` aktif.'],
      })
    }
  }

  private async presentFiles(dir: string, extra: string[]): Promise<Set<string>> {
    const found = new Set<string>()
    for (const name of new Set([DIST_FILE, DOMAIN_FILE, OVERRIDE_FILE, ...extra])) {
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

  private printPlan(p: {
    composeDiff?: ReturnType<typeof summarizeDiff>
    dir: string
    domainDiff?: ReturnType<typeof summarizeDiff>
    files: string[]
    merge: ReturnType<typeof mergeEnv>
    pull?: string[]
    running?: string
    up: string[]
  }): void {
    this.log(`Instalasi: ${p.dir}`)
    const show = (name: string, diff?: ReturnType<typeof summarizeDiff>) => {
      if (!diff) {
        this.log(`\n${name}: tidak berubah`)
        return
      }

      this.log(`\n${name}: ditulis ulang dari salinan yang dibundel (+${diff.added} −${diff.removed} baris)`)
      for (const l of diff.lines) this.log(`  ${l}`)
    }

    show(DIST_FILE, p.composeDiff)
    if (p.files.includes(DOMAIN_FILE)) show(DOMAIN_FILE, p.domainDiff)

    this.log(`\n.env.dist: ${p.merge.added.length + p.merge.overridden.length > 0 ? 'digabung (secret & nilai lama dipertahankan)' : 'tidak berubah'}`)
    for (const k of p.merge.added) this.log(`  + ${k} (ditambahkan)`)
    for (const k of p.merge.overridden) this.log(`  ~ ${k} (diganti sesuai flag)`)
    for (const w of p.merge.warnings) this.warn(w)

    this.log(`\n${OVERRIDE_FILE}: tidak disentuh`)
    this.log(`File compose: ${p.files.join(' + ')}${p.running ? ' (sama seperti stack yang berjalan)' : ' (container api tidak ditemukan — pakai aturan bawaan)'}`)
    const dropped = runningFileNames(p.running).filter((n) => !p.files.includes(n))
    if (dropped.length > 0) this.warn(`File compose dari stack berjalan tidak ditemukan lagi di folder dan dilewati: ${dropped.join(', ')}`)
    this.log('Perintah:')
    if (p.pull) this.log(`  docker ${p.pull.join(' ')}`)
    this.log(`  docker ${p.up.join(' ')}`)
    this.log('Volume tidak disentuh.')
  }

  /**
   * Config files the api container is running with — only trusted when its
   * working_dir label is this install folder (another stack named `aoox`
   * elsewhere must not steer our `-f` list).
   */
  private async runningStack(dir: string): Promise<string | undefined> {
    const id = await dockerCapture([
      'ps',
      '-a',
      '--filter',
      'label=com.docker.compose.project=aoox',
      '--filter',
      'label=com.docker.compose.service=api',
      '--format',
      '{{.ID}}',
    ])
    const first = id?.split('\n')[0]
    if (!first) return undefined
    const out = await dockerCapture([
      'inspect',
      '-f',
      '{{index .Config.Labels "com.docker.compose.project.working_dir"}}|{{index .Config.Labels "com.docker.compose.project.config_files"}}',
      first,
    ])
    if (!out) return undefined
    const [workdir, files] = out.split('|')
    return workdir && resolve(workdir) === dir && files ? files : undefined
  }
}
