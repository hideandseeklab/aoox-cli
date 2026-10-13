/**
 * What `aoox run` tells the user on stderr before the child starts: a counted
 * banner and warnings, with optional colour. No dependency: a few raw ANSI
 * codes, switched on only when stderr is a terminal (or FORCE_COLOR asks).
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
  yellow(text: string): string
}

function wrap(on: boolean, open: number, close: number): (text: string) => string {
  return on ? (text) => `\u001B[${open}m${text}\u001B[${close}m` : (text) => text
}

export function makeStyle(on: boolean): Style {
  return {
    bold: wrap(on, 1, 22),
    cyan: wrap(on, 36, 39),
    dim: wrap(on, 2, 22),
    green: wrap(on, 32, 39),
    yellow: wrap(on, 33, 39),
  }
}

export function variableCount(n: number): string {
  return `${n} variable${n === 1 ? '' : 's'}`
}

export type BannerSource =
  | {kind: 'linked'; layers: string[]; owner: string}
  | {kind: 'single'; label: string}

/** The one-line banner. Linked: the layers in merge order, then `own env`; single: one set environment only. */
export function formatBanner(count: number, source: BannerSource, s: Style): string {
  const head = `${s.green(s.bold('aoox'))}  `
  if (source.kind === 'single') {
    return `${head}Injecting ${s.bold(variableCount(count))} from ${s.cyan(source.label)} ${s.dim('(no links, no own env)')}`
  }

  const layers = [...source.layers.map((l) => s.cyan(l)), s.dim('own env')].join(` ${s.dim('<')} `)
  return `${head}Injecting ${s.bold(variableCount(count))} into your process ${s.dim('·')} ${source.owner}: ${layers}`
}

export function formatWarning(text: string, s: Style): string {
  return `${s.yellow('warn')}  ${text}`
}
