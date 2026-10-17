import {confirm} from '@inquirer/prompts'
import {Command, Flags} from '@oclif/core'
import {chmod, copyFile, mkdir, readFile, rename, stat, writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

import {overrideDryRunNote, overrideGuardMessage} from '../lib/compose-version.js'
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
import {stepLine, successLine, warnLine} from '../lib/style.js'
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
    'Repair/refresh an existing aoox installation without losing data: rewrite compose, merge .env.dist (secrets are never regenerated), then pull + recreate'
  static examples = [
    'sudo <%= config.bin %> <%= command.id %> --dry-run',
    'sudo <%= config.bin %> <%= command.id %>',
    'sudo <%= config.bin %> <%= command.id %> --yes --terminal-ssh-user root',
  ]
  static flags = {
    dir: Flags.string({default: '/opt/aoox', description: 'Installation directory'}),
    'dry-run': Flags.boolean({default: false, description: 'Print the plan (changed files, keys to add, compose commands) without changing anything'}),
    'no-pull': Flags.boolean({default: false, description: 'Skip docker compose pull (use the images already present)'}),
    'terminal-ssh-user': Flags.string({description: 'Set/overwrite TERMINAL_SSH_USER in .env.dist during repair'}),
    yes: Flags.boolean({char: 'y', default: false, description: 'Do not ask for confirmation'}),
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
      this.error(`No aoox installation found in ${dir} (${DIST_FILE} and .env.dist must exist).`, {
        suggestions: ['For a new installation: `sudo aoox install`. For another folder: --dir <folder>.'],
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
      if (files.includes(OVERRIDE_FILE)) {
        const dockerAvailable = commandExists('docker')
        const note = overrideDryRunNote(
          await readIfExists(`${dir}/${OVERRIDE_FILE}`),
          dockerAvailable ? await dockerCapture(['compose', 'version', '--short']) : undefined,
          dockerAvailable,
        )
        if (note) this.logToStderr(warnLine(note))
      }

      this.log('\n(dry-run) Nothing was changed.')
      return
    }

    await this.ensureDocker()

    // The override written by "Only allow access through the domain" needs Compose >= 2.24.4 (!override);
    // stop before anything is backed up, rewritten or recreated.
    if (files.includes(OVERRIDE_FILE)) {
      const guard = overrideGuardMessage(
        await readIfExists(`${dir}/${OVERRIDE_FILE}`),
        await dockerCapture(['compose', 'version', '--short']),
      )
      if (guard) this.error(guard)
    }

    if (!flags.yes) {
      const ok = await confirm({
        default: true,
        message: `Apply in ${dir} (data and secrets are left untouched) and then recreate the containers?`,
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
      this.log(stepLine('docker compose pull'))
      await dockerInherit(pull, dir)
    }

    this.log(stepLine('docker compose up -d --force-recreate'))
    await dockerInherit(up, dir)

    const env = parseEnv(merge.content)
    this.log(stepLine('Waiting for the API to be ready'))
    const ready = await waitForApi(env.get('API_PORT') || '3001', READY_TIMEOUT_MS)
    if (!ready) this.logToStderr(warnLine(`The API did not respond in the expected time — check \`docker compose ${files.map((f) => `-f ${f}`).join(' ')} logs api\` in ${dir}.`))

    const version = await dockerCapture(
      [...composeArgs(files, 'exec', '-T', 'api', 'node', '-p', "require('./package.json').version")],
      dir,
    )

    this.log('')
    this.log(successLine(`Done. aoox in ${dir} has been refreshed${version ? ` (version ${version})` : ''}.`))
    this.log(`  .env.dist keys added: ${merge.added.length > 0 ? merge.added.join(', ') : '(none)'}`)
    this.log(`  Backup of previous files: ${backupDir ?? '(no file changes, no backup needed)'}`)
    this.log(`  Open: ${env.get('WEB_ORIGIN') || 'http://localhost:3000'}`)
  }

  private assertPreconditions(): void {
    if (process.platform !== 'linux') {
      this.error('aoox reinstall only runs on a Linux VPS (run it directly on the target server).')
    }

    if (!isRoot()) {
      this.error('Root is required — this command reads .env.dist (mode 600) and manages Docker.', {
        suggestions: [
          'sudo aoox reinstall …',
          'If `sudo: aoox: command not found` (installed in ~/.local/bin): sudo "$(command -v aoox)" reinstall …',
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

    this.log(stepLine('Backing up previous files to', backupDir))
  }

  private async ensureDocker(): Promise<void> {
    if (!commandExists('docker') || !dockerRunning()) {
      this.error('Docker was not found or is not running (or there is no access to its socket).', {
        suggestions: ['Run with sudo, and make sure `systemctl status docker` is active.'],
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
    this.log(`Installation: ${p.dir}`)
    const show = (name: string, diff?: ReturnType<typeof summarizeDiff>) => {
      if (!diff) {
        this.log(`\n${name}: unchanged`)
        return
      }

      this.log(`\n${name}: rewritten from the bundled copy (+${diff.added} −${diff.removed} lines)`)
      for (const l of diff.lines) this.log(`  ${l}`)
    }

    show(DIST_FILE, p.composeDiff)
    if (p.files.includes(DOMAIN_FILE)) show(DOMAIN_FILE, p.domainDiff)

    this.log(`\n.env.dist: ${p.merge.added.length + p.merge.overridden.length > 0 ? 'merged (secrets and existing values kept)' : 'unchanged'}`)
    for (const k of p.merge.added) this.log(`  + ${k} (added)`)
    for (const k of p.merge.overridden) this.log(`  ~ ${k} (replaced per flag)`)
    for (const w of p.merge.warnings) this.logToStderr(warnLine(w))

    this.log(`\n${OVERRIDE_FILE}: left untouched`)
    this.log(`Compose files: ${p.files.join(' + ')}${p.running ? ' (same as the running stack)' : ' (api container not found — using default rules)'}`)
    const dropped = runningFileNames(p.running).filter((n) => !p.files.includes(n))
    if (dropped.length > 0) this.logToStderr(warnLine(`Compose files from the running stack are no longer in the folder and were skipped: ${dropped.join(', ')}`))
    this.log('Commands:')
    if (p.pull) this.log(`  docker ${p.pull.join(' ')}`)
    this.log(`  docker ${p.up.join(' ')}`)
    this.log('Volumes left untouched.')
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
