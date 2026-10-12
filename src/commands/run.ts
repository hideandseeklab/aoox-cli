import {Flags} from '@oclif/core'
import {spawn} from 'node:child_process'
import {existsSync, statSync} from 'node:fs'
import {readFile} from 'node:fs/promises'
import {delimiter, extname, join, resolve as resolvePath} from 'node:path'

import {EnvCommand, environmentFlag, projectFlags} from '../lib/env-command.js'
import {
  buildChildEnv,
  exitCodeForSignal,
  layerVariables,
  needsWindowsShell,
  quoteForCmd,
  splitAtDoubleDash,
} from '../lib/env-run.js'
import {hasReferences, REFERENCE_NOTE, toRecord} from '../lib/env-text.js'

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

export default class Run extends EnvCommand {
  static description =
    'Run a command with the variables of an environment, without writing them to disk. Put the command after `--`; its exit code is forwarded. The read is recorded in the audit log'
  static examples = [
    '<%= config.bin %> <%= command.id %> -- npm run dev',
    '<%= config.bin %> <%= command.id %> --env staging -- node server.js',
    '<%= config.bin %> <%= command.id %> --file .env.local -- npm run dev',
  ]
  static flags = {
    ...projectFlags,
    ...environmentFlag,
    file: Flags.string({
      description:
        'A local .env file layered on top of the environment (it wins over aoox, which wins over the current environment). Only read, never written',
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

    const resolved = await this.resolveEnvironment(flags)
    const revealed = await this.reveal(resolved)
    if (hasReferences(revealed.variables) || hasReferences(localText)) {
      this.logToStderr(`Note: ${REFERENCE_NOTE}`)
    }

    // Precedence: process.env < aoox environment < local file.
    const env = buildChildEnv(process.env, layerVariables(toRecord(revealed.variables), local))
    const code = await this.spawnChild(command, env)
    // The Windows exit fix (bin/run.js) makes process.exit a no-op that only
    // sets the code; exiting through oclif keeps both paths the same.
    if (code !== 0) this.exit(code)
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
            ? `❌ Command not found: ${program}`
            : `❌ Could not start ${program}: ${error.message}`,
        )
        done(error.code === 'ENOENT' ? 127 : 126)
      })
      child.on('close', (code, signal) => {
        done(code ?? (signal ? exitCodeForSignal(signal) : 1))
      })
    })
  }
}
