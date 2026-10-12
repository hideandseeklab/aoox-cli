import {toRecord} from './env-text.js'

export interface PromotionPlan {
  /** Chosen keys that do not exist in the target yet. */
  added: string[]
  /** Chosen keys whose value differs from the target's. */
  changed: string[]
  /** Chosen keys not set in the source (cannot be promoted). */
  missing: string[]
  /** Chosen keys that already have the same value in the target (skipped). */
  same: string[]
}

/**
 * What a promotion would do, from the two texts. `keys` = the names asked
 * for, or `'all'` for every variable of the source. Values never leave this
 * function: only names are returned.
 */
export function planPromotion(sourceText: string, targetText: string, keys: 'all' | string[]): PromotionPlan {
  const source = toRecord(sourceText)
  const target = toRecord(targetText)
  const wanted = keys === 'all' ? Object.keys(source) : [...new Set(keys)]
  const plan: PromotionPlan = {added: [], changed: [], missing: [], same: []}
  for (const key of wanted) {
    if (!(key in source)) plan.missing.push(key)
    else if (!(key in target)) plan.added.push(key)
    else if (target[key] === source[key]) plan.same.push(key)
    else plan.changed.push(key)
  }

  return plan
}

function firstNames(list: string[]): string {
  return `${list.slice(0, 3).join(',')}${list.length > 3 ? ',…' : ''}`
}

/** Key-level summary of a history entry, e.g. `+2 A,B  ~1 C  -1 D`; names only. */
export function describeSummary(s: {added: string[]; changed: string[]; flags: string[]; removed: string[]}): string {
  const part = (sign: string, list: string[]) => (list.length > 0 ? `${sign}${list.length} ${firstNames(list)}` : '')
  const parts = [part('+', s.added), part('~', s.changed), part('-', s.removed)].filter(Boolean)
  if (s.flags.length > 0) parts.push(`secret flag: ${firstNames(s.flags)}`)
  return parts.length > 0 ? parts.join('  ') : 'comments or order only'
}
