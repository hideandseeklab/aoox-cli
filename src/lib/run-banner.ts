/**
 * What `aoox run` tells the user on stderr before the child starts: a counted
 * banner and warnings, with optional colour (see style.ts).
 */

import type {Style} from './style.js'

export {colorEnabled, makeStyle, type Style} from './style.js'

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
