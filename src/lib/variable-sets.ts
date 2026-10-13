/* eslint-disable no-template-curly-in-string */
/**
 * Pure helpers of `aoox env …` and `aoox run` on top of variable sets: which
 * set and environment a command means, how the ordered link list changes,
 * and how `aoox run` merges the linked environments. No network here.
 */
import type {LinkView} from './types.js'

import {parseEnvLines} from './env-text.js'

/** A choice the CLI could not make on its own: the message plus the hint lines. */
export class SelectionError extends Error {
  readonly hints: string[]

  constructor(message: string, hints: string[] = []) {
    super(message)
    this.hints = hints
    this.name = 'SelectionError'
  }
}

interface SetLike {
  environments: Array<{id: string; name: string}>
  id: string
  name: string
  slug: string
}

/** A set by slug (preferred), id, or case-insensitive name. */
export function findSet<T extends SetLike>(sets: T[], wanted: string): T | undefined {
  const w = wanted.trim()
  return (
    sets.find((s) => s.slug === w) ??
    sets.find((s) => s.id === w) ??
    sets.find((s) => s.name.toLowerCase() === w.toLowerCase())
  )
}

function setList(sets: SetLike[]): string {
  return sets.length === 0 ? 'none you can see' : sets.map((s) => s.slug).join(', ')
}

/**
 * The set a command works on. `--set` wins; otherwise the only set the
 * linked application (or stack) links, or the only set the caller can see.
 * Several candidates are never guessed between: the error lists them.
 */
export function pickSet<T extends SetLike>(
  sets: T[],
  wanted?: string,
  links?: LinkView[],
): T {
  if (wanted) {
    const found = findSet(sets, wanted)
    if (!found) throw new SelectionError(`Variable set "${wanted}" not found.`, [`Sets you can see: ${setList(sets)}`])
    return found
  }

  const linked = [...new Set((links ?? []).map((l) => l.setId))]
  if (linked.length === 1) {
    const found = sets.find((s) => s.id === linked[0])
    if (found) return found
  }

  if (linked.length > 1) {
    const slugs = [...new Set((links ?? []).map((l) => l.setSlug))]
    throw new SelectionError('The linked application uses several variable sets; choose one with --set.', [
      `Linked sets: ${slugs.join(', ')}`,
    ])
  }

  if (sets.length === 1) return sets[0]
  throw new SelectionError(
    sets.length === 0 ? 'No variable set is shared with you.' : 'Choose a variable set with --set <slug>.',
    sets.length === 0 ? ['An instance owner or admin creates sets and shares them in the dashboard (Variables).'] : [`Sets: ${setList(sets)}`],
  )
}

/**
 * The environment of `set` a command works on. `--env` wins; otherwise the
 * only environment of this set the linked application links. There is no
 * default environment name: anything else is an error listing the choices.
 */
export function pickEnvironment<E extends {id: string; name: string}>(
  set: {environments: E[]; id: string; slug: string},
  wanted: string | undefined,
  links?: LinkView[],
): E {
  const names = set.environments.map((e) => e.name).join(', ') || 'none'
  if (wanted) {
    const found = set.environments.find((e) => e.name === wanted.trim())
    if (!found) throw new SelectionError(`Set "${set.slug}" has no environment "${wanted}".`, [`Environments: ${names}`])
    return found
  }

  const linked = [...new Set((links ?? []).filter((l) => l.setId === set.id).map((l) => l.environmentId))]
  if (linked.length === 1) {
    const found = set.environments.find((e) => e.id === linked[0])
    if (found) return found
  }

  throw new SelectionError(
    linked.length > 1
      ? `The linked application uses several environments of "${set.slug}"; choose one with --env.`
      : `Choose an environment of "${set.slug}" with --env <name>.`,
    [`Environments: ${names}`],
  )
}

/** The link list as `PUT …/variable-sets` takes it. */
export type LinkList = Array<{environmentId: string}>

/**
 * Adds `environmentId` at the 1-based `position` (default: last, so it wins
 * over the others). An environment that is already linked is moved instead.
 */
export function addLink(current: LinkList, environmentId: string, position?: number, max = 10): LinkList {
  const rest = current.filter((l) => l.environmentId !== environmentId)
  if (rest.length === current.length && rest.length >= max) {
    throw new SelectionError(`At most ${max} environments can be linked.`, ['Unlink one first: aoox env unlink --set <slug> --env <name>'])
  }

  const size = rest.length + 1
  if (position !== undefined && (!Number.isInteger(position) || position < 1 || position > size)) {
    throw new SelectionError(`--position must be between 1 and ${size}.`)
  }

  const at = (position ?? size) - 1
  return [...rest.slice(0, at), {environmentId}, ...rest.slice(at)]
}

/** Removes `environmentId`; an error when it was not linked. */
export function removeLink(current: LinkList, environmentId: string): LinkList {
  const next = current.filter((l) => l.environmentId !== environmentId)
  if (next.length === current.length) throw new SelectionError('That environment is not linked.')
  return next
}

/** `${{scope.name…}}`, the same shape as the API's `REFERENCE`. */
const REFERENCE = /\$\{\{\s*([a-z]+)\.([A-Za-z0-9_-]+)(?:\.([a-z]+))?(?::([A-Za-z0-9_$-]+))?\s*\}\}/g

/** Values that still say `${{project.…}}`, which became `${{vars.…}}`. */
export function projectReferenceKeys(text: string): string[] {
  return parseEnvLines(text)
    .filter(([, v]) => /\$\{\{\s*project\./.test(v))
    .map(([k]) => k)
}

export const PROJECT_REFERENCE_HINT = '${{project.KEY}} was renamed to ${{vars.KEY}}; write ${{vars.KEY}} instead.'

export interface RunLayer {
  /** For messages, e.g. `shared/production`. */
  label: string
  text: string
}

export interface RunMerge {
  /** Variables passed to the child. */
  env: Record<string, string>
  /** Keys that name a `${{vars.KEY}}` no linked set defines (left as written). */
  unknownVars: string[]
  /** Keys whose value keeps a `${{database…}}` or `${{secret…}}` reference (left as written). */
  unresolved: string[]
}

/**
 * What `aoox run` passes to the child, mirroring the deploy-time merge as far
 * as the CLI can: the linked environments in order (a later one wins on the
 * same key), then the owner's own env on top. `${{vars.KEY}}` is replaced by
 * the merged set value of KEY, one level deep like the server (that value is
 * used as written). `${{database…}}` and `${{secret…}}` cannot be resolved
 * without the panel's deploy machinery, so they are left as written and
 * reported; the same for a `${{vars.KEY}}` no set defines.
 */
export function mergeForRun(layers: RunLayer[], ownText = ''): RunMerge {
  const vars: Record<string, string> = {}
  for (const layer of layers) {
    for (const [k, v] of parseEnvLines(layer.text)) vars[k] = v
  }

  const merged: Record<string, string> = {...vars}
  for (const [k, v] of parseEnvLines(ownText)) merged[k] = v

  const unresolved = new Set<string>()
  const unknownVars = new Set<string>()
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(merged)) {
    env[key] = value.replaceAll(REFERENCE, (whole, scope: string, name: string, field?: string) => {
      if (scope === 'vars' && field === undefined) {
        if (name in vars) return vars[name]
        unknownVars.add(key)
        return whole
      }

      unresolved.add(key)
      return whole
    })
  }

  return {env, unknownVars: [...unknownVars], unresolved: [...unresolved]}
}

function nameList(list: string[]): string {
  return list.length > 6 ? `${list.slice(0, 6).join(', ')}, … (${list.length})` : list.join(', ')
}

/**
 * The ordered links of an application or stack as text lines (1-based
 * positions, like `--position`), with the conflict hints the API computes.
 */
export function describeLinks(owner: string, links: LinkView[]): string[] {
  if (links.length === 0) {
    return [`${owner} links no variable set environment: it only gets its own env.`, 'Link one with: aoox env link --set <slug> --env <name>']
  }

  const lines = [`${owner}: linked environments, in merge order (a later one wins; the own env wins over all)`]
  for (const [i, l] of [...links].sort((a, b) => a.position - b.position).entries()) {
    const count = `${l.keys.length} variable${l.keys.length === 1 ? '' : 's'}`
    lines.push(`  ${i + 1}. ${l.setSlug}/${l.environmentName}${l.protected ? ' (protected)' : ''}  ${count}`)
    if (l.shadowedKeys.length > 0) lines.push(`     overridden by a later link: ${nameList(l.shadowedKeys)}`)
    if (l.overriddenByOwnEnv.length > 0) lines.push(`     overridden by the own env: ${nameList(l.overriddenByOwnEnv)}`)
  }

  lines.push('Changes take effect on the next deploy.')
  return lines
}

/** The link `aoox env unlink` means: by 1-based `position`, or by set (slug, id or name) and environment name. */
export function findLink(links: LinkView[], by: {env?: string; position?: number; set?: string}): LinkView {
  const ordered = [...links].sort((a, b) => a.position - b.position)
  if (by.position !== undefined) {
    const found = ordered[by.position - 1]
    if (!found) throw new SelectionError(`There is no link at position ${by.position}.`, ['See them with: aoox env links'])
    return found
  }

  const wanted = (by.set ?? '').trim()
  const found = ordered.find(
    (l) =>
      (l.setSlug === wanted || l.setId === wanted || l.setName.toLowerCase() === wanted.toLowerCase()) &&
      l.environmentName === by.env,
  )
  if (!found) throw new SelectionError(`${wanted}/${by.env ?? ''} is not linked.`, ['See the links with: aoox env links'])
  return found
}
