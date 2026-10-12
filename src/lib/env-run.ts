import {constants} from 'node:os'

/**
 * The environment of the child `aoox run` starts: the current environment
 * with the panel's variables on top (they win). On Windows variable names are
 * case-insensitive, so an existing `Path` is replaced by `PATH` rather than
 * both being passed.
 */
export function buildChildEnv(
  base: NodeJS.ProcessEnv,
  vars: Record<string, string>,
  platform: NodeJS.Platform = process.platform,
): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {...base}
  for (const [key, value] of Object.entries(vars)) {
    if (platform === 'win32') {
      const lower = key.toLowerCase()
      for (const existing of Object.keys(out)) {
        if (existing.toLowerCase() === lower) delete out[existing]
      }
    }

    out[key] = value
  }

  return out
}

/** Splits `aoox run [flags] -- cmd args`: what is before and after the first `--`. */
export function splitAtDoubleDash(argv: string[]): {command: string[]; own: string[]} {
  const at = argv.indexOf('--')
  return at === -1 ? {command: [], own: argv} : {command: argv.slice(at + 1), own: argv.slice(0, at)}
}

/** Exit code of a child that ended with a signal, the shell way (128 + signal number). */
export function exitCodeForSignal(signal: NodeJS.Signals): number {
  const n = (constants.signals as Record<string, number | undefined>)[signal]
  return 128 + (n ?? 1)
}

/** Quotes one argument for `cmd.exe` (only used for `.cmd`/`.bat` targets). */
export function quoteForCmd(arg: string): string {
  if (arg === '') return '""'
  // Anything that is not plainly safe is wrapped; embedded quotes are doubled
  // and `%` is doubled so cmd does not expand variables inside the argument.
  if (/^[\w./:=@+,-]+$/.test(arg)) return arg
  return `"${arg.replaceAll('"', '""').replaceAll('%', '%%')}"`
}

/** Whether `command` resolves to a `.cmd`/`.bat` shim, which Windows can only start through a shell. */
export function needsWindowsShell(
  command: string,
  platform: NodeJS.Platform,
  resolve: (command: string) => string | undefined,
): boolean {
  if (platform !== 'win32') return false
  const target = resolve(command) ?? command
  return /\.(cmd|bat)$/i.test(target)
}

/**
 * Layers variables for `aoox run`: `process.env < aoox environment < local
 * file`. The most specific source wins, as with a `.env.local` over shared
 * config: the file is the developer's explicit override for this run.
 */
export function layerVariables(...layers: Array<Record<string, string>>): Record<string, string> {
  return Object.assign({}, ...layers) as Record<string, string>
}
