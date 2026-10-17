/**
 * Terminal colour without a dependency: a few raw ANSI codes, switched on only
 * when the stream is a terminal (or FORCE_COLOR asks). Shared by the `aoox run`
 * banner and the error lines every command prints on stderr.
 */

/** no-color.org: a non-empty NO_COLOR disables colour; FORCE_COLOR (not "0"/"false"/empty) enables it without a TTY. */
export function colorEnabled(env: NodeJS.ProcessEnv, isTTY: boolean): boolean {
  if (env.NO_COLOR) return false
  const force = env.FORCE_COLOR
  if (force !== undefined) return force !== '' && force !== '0' && force !== 'false'
  return isTTY && env.TERM !== 'dumb'
}

export interface Style {
  bold(text: string): string
  cyan(text: string): string
  dim(text: string): string
  green(text: string): string
  red(text: string): string
  yellow(text: string): string
}

function wrap(on: boolean, open: number, close: number): (text: string) => string {
  return on ? (text) => `[${open}m${text}[${close}m` : (text) => text
}

export function makeStyle(on: boolean): Style {
  return {
    bold: wrap(on, 1, 22),
    cyan: wrap(on, 36, 39),
    dim: wrap(on, 2, 22),
    green: wrap(on, 32, 39),
    red: wrap(on, 31, 39),
    yellow: wrap(on, 33, 39),
  }
}

/** The first line of an error: a red `error` label (same shape as the `warn` label of `aoox run`), two spaces, the text. */
export function formatError(text: string, s: Style): string {
  return `${s.red('error')}  ${text}`
}

/** `formatError` styled for the current process: colour only when stderr is a terminal (NO_COLOR / FORCE_COLOR honoured). */
export function errorLine(text: string): string {
  return formatError(text, makeStyle(colorEnabled(process.env, Boolean(process.stderr.isTTY))))
}
