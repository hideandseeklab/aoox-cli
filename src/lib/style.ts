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

// ---- Step-style lines -------------------------------------------------------
// Every command that prints progress uses these instead of a bare `this.log` /
// `this.warn`, so the scheme stays the same everywhere:
//   step     `==> Build web:1.4.2`   `==>` bold cyan, label bold, value cyan
//   success  `✓ Pushed web:1.4.2`    green; the `✓` only appears with colour on,
//                                    so plain/CI output has no symbol
//   warn     `warn  text`            yellow label, like `error`
//   hint     secondary info          dim
// stdout lines decide colour from stdout, stderr lines from stderr.

/** `==> label value`: `==>` bold cyan, label bold, value cyan. */
export function formatStep(s: Style, label: string, value?: string): string {
  return `${s.bold(s.cyan('==>'))} ${s.bold(label)}${value ? ` ${s.cyan(value)}` : ''}`
}

/** Green result line; `symbol` is true when colour is on (plain output has no symbol). */
export function formatSuccess(s: Style, symbol: boolean, label: string, value?: string): string {
  return `${symbol ? `${s.green('✓')} ` : ''}${s.green(label)}${value ? ` ${s.cyan(value)}` : ''}`
}

/** Yellow `warn` label, two spaces, the text (same shape as the red `error` label). */
export function formatWarn(s: Style, text: string): string {
  return `${s.yellow('warn')}  ${text}`
}

const stdoutColor = (): boolean => colorEnabled(process.env, Boolean(process.stdout.isTTY))
const stderrColor = (): boolean => colorEnabled(process.env, Boolean(process.stderr.isTTY))

/** For `this.log`. */
export function stepLine(label: string, value?: string): string {
  return formatStep(makeStyle(stdoutColor()), label, value)
}

/** For `this.log`. */
export function successLine(label: string, value?: string): string {
  const colour = stdoutColor()
  return formatSuccess(makeStyle(colour), colour, label, value)
}

/** Dim secondary text for `this.log`. */
export function hintLine(text: string): string {
  return makeStyle(stdoutColor()).dim(text)
}

/** For `this.logToStderr` (warnings go to stderr, as `this.warn` did). */
export function warnLine(text: string): string {
  return formatWarn(makeStyle(stderrColor()), text)
}
