import {Flags} from '@oclif/core'
import {spawn} from 'node:child_process'
import {existsSync, statSync} from 'node:fs'
import {readFile} from 'node:fs/promises'
import {delimiter, extname, join, resolve as resolvePath} from 'node:path'

import {EnvCommand, environmentCommandFlags} from '../lib/env-command.js'
import {
  buildChildEnv,
  exitCodeForSignal,
  layerVariables,
  needsWindowsShell,
  quoteForCmd,
  splitAtDoubleDash,
} from '../lib/env-run.js'
import {hasReferences, toRecord} from '../lib/env-text.js'
import {type BannerSource, colorEnabled, formatBanner, formatWarning, makeStyle} from '../lib/run-banner.js'
import {errorLine} from '../lib/style.js'
import {mergeForRun, type RunLayer, type RunMerge} from '../lib/variable-sets.js'

/** First match of `command` on PATH using PATHEXT (Windows), or undefined. */
function resolveOnPath(command: string): string | undefined {
  const exts = (process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)
  const dirs = command.includes('/') || command.includes('\\') ? [''] : (process.env.PATH ?? '').split(delimiter)
  for (const dir of dirs) {
    const base = dir ? join(dir, command) : command
    const candidates = extname(command) ? [base] : exts.map((e) => base + e)
    for (const c of candidates) {
      if (existsSync(c) && statSync(c).isFile()) return c
    }
  }

  return undefined
}

interface RunResult {
  banner: BannerSource
  /** The owner syncs secrets from Infisical, which the CLI cannot fetch. */
  infisical: boolean
  merged: RunMerge
}

export default class Run extends EnvCommand {
  static description =
    'Run a command with the variables the linked application gets at deploy time, without writing them to disk: its linked variable set environments in order (a later one wins), then its own env on top. With --set/--env, exactly one set environment instead. Put the command after `--`; its exit code is forwarded. Before the command starts, one line on stderr says how many variables aoox injects and from which layers (colour only on a terminal; NO_COLOR turns it off, FORCE_COLOR forces it); --quiet hides it, but never the warnings. Every read is recorded in the audit log'
  static examples = [
    '<%= config.bin %> <%= command.id %> -- npm run dev',
    '<%= config.bin %> <%= command.id %> --set shared --env staging -- node server.js',
    '<%= config.bin %> <%= command.id %> --file .env.local -- npm run dev',
    '<%= config.bin %> <%= command.id %> --stack <id> -- docker compose config',
    '<%= config.bin %> <%= command.id %> --quiet -- npm run dev',
  ]
  static flags = {
    ...environmentCommandFlags,
    file: Flags.string({
      description:
        'A local .env file layered on top (it wins over aoox, which wins over the current environment). Only read, never written',
    }),
    quiet: Flags.boolean({
      char: 'q',
      description:
        'Do not print the "Injecting N variables" line or the informational notes. Warnings about unresolved references and excluded Infisical secrets are always printed',
    }),
  }
  static strict = false

  async run(): Promise<void> {
    // Everything after the first `--` belongs to the child, whatever it looks like.
    const {command, own} = splitAtDoubleDash(this.argv)
    const {flags} = await this.parse(Run, own)
    if (command.length === 0) {
      this.fail('No command to run.', 'Put it after --, e.g.: aoox run -- npm run dev')
    }

    // Read the local file first: a typo costs no audited reveal.
    let local: Record<string, string> = {}
    let localText = ''
    if (flags.file) {
      try {
        localText = await readFile(resolvePath(process.cwd(), flags.file), 'utf8')
      } catch (error) {
        const {code} = error as NodeJS.ErrnoException
        this.fail(code === 'ENOENT' ? `${flags.file} does not exist.` : `Cannot read ${flags.file}: ${(error as Error).message}`)
      }

      local = toRecord(localText.replace(/^\uFEFF/, ''))
    }

    const {banner, infisical, merged} =
      flags.set || flags.env ? await this.oneEnvironment(flags) : await this.linkedVariables(flags)
    // Precedence: process.env < aoox variables < local file.
    const injected = layerVariables(merged.env, local)

    const style = makeStyle(colorEnabled(process.env, Boolean(process.stderr.isTTY)))
    if (!flags.quiet) this.logToStderr(formatBanner(Object.keys(injected).length, banner, style))
    const warn = (text: string) => this.logToStderr(formatWarning(text, style))
    if (infisical) {
      warn('Secrets synced from the external secret source (Infisical) are not included; only the panel fetches them at deploy time.')
    }

    if (merged.unresolved.length > 0) {
      warn(`Left as written (only the panel resolves database and secret references at deploy time): ${merged.unresolved.join(', ')}`)
    }

    if (merged.unknownVars.length > 0) {
      warn(`Left as written (no linked set defines the \${{vars.…}} they name): ${merged.unknownVars.join(', ')}`)
    }

    if (!flags.quiet && hasReferences(localText)) {
      this.logToStderr(style.dim(`Note: ${flags.file} has \${{…}} references; values from the file are used as written.`))
    }

    const env = buildChildEnv(process.env, injected)
    const code = await this.spawnChild(command, env)
    // The Windows exit fix (bin/run.js) makes process.exit a no-op that only
    // sets the code; exiting through oclif keeps both paths the same.
    if (code !== 0) this.exit(code)
  }

  /** The default: every linked environment in order, then the owner's own env (see `mergeForRun`). */
  private async linkedVariables(flags: {app?: string; stack?: string; token?: string; url?: string}): Promise<RunResult> {
    const {config, link} = await this.connect(flags)
    const owner = (await this.resolveOwner(config, link, flags, true))!
    const links = [...owner.detail.variableSets].sort((a, b) => a.position - b.position)
    const layers: RunLayer[] = []
    // One at a time, in order: a refused reveal (protected, viewer, token
    // scope) stops before the child starts, never with a partial environment.
    for (const l of links) {
      const label = `${l.setSlug}/${l.environmentName}`
      // eslint-disable-next-line no-await-in-loop -- sequential on purpose (see above)
      const revealed = await this.revealById(config, {environmentId: l.environmentId, label, setId: l.setId})
      layers.push({label, text: revealed.variables})
    }

    return {
      banner: {kind: 'linked', layers: layers.map((l) => l.label), owner: owner.label},
      infisical: Boolean(owner.detail.secretSource?.sync),
      merged: mergeForRun(layers, owner.detail.env ?? ''),
    }
  }

  /** `--set`/`--env`: exactly one set environment, without links or the own env. */
  private async oneEnvironment(flags: {
    app?: string
    env?: string
    set?: string
    stack?: string
    token?: string
    url?: string
  }): Promise<RunResult> {
    const resolved = await this.resolveEnvironment(flags)
    const revealed = await this.reveal(resolved)
    return {
      banner: {kind: 'single', label: resolved.label},
      infisical: false,
      merged: mergeForRun([{label: resolved.label, text: revealed.variables}]),
    }
  }

  /** Starts the child with inherited stdio; resolves with the exit code to forward. */
  private spawnChild(command: string[], env: NodeJS.ProcessEnv): Promise<number> {
    const [program, ...args] = command
    const shell = needsWindowsShell(program, process.platform, resolveOnPath)

    return new Promise((resolve) => {
      const child = shell
        ? spawn([program, ...args].map((a, i) => (i === 0 ? a : quoteForCmd(a))).join(' '), {
            env,
            shell: true,
            stdio: 'inherit',
            windowsHide: false,
          })
        : spawn(program, args, {env, stdio: 'inherit'})

      // Ctrl+C already reaches the child through the terminal; forward the
      // signals a supervisor sends to this process only.
      const forward = (signal: NodeJS.Signals) => () => {
        child.kill(signal)
      }

      const handlers = (['SIGINT', 'SIGTERM', 'SIGHUP'] as const).map((s) => [s, forward(s)] as const)
      for (const [s, h] of handlers) process.on(s, h)
      const done = (code: number) => {
        for (const [s, h] of handlers) process.off(s, h)
        resolve(code)
      }

      child.on('error', (error: NodeJS.ErrnoException) => {
        this.logToStderr(
          error.code === 'ENOENT'
            ? errorLine(`Command not found: ${program}`)
            : errorLine(`Could not start ${program}: ${error.message}`),
        )
        done(error.code === 'ENOENT' ? 127 : 126)
      })
      child.on('close', (code, signal) => {
        done(code ?? (signal ? exitCodeForSignal(signal) : 1))
      })
    })
  }
}
