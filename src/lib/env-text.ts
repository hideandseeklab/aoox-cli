/**
 * `KEY=VALUE` text helpers, mirroring `aoox-api/src/modules/project/env-text.ts`.
 *
 * The panel stores one environment as plain text and reads it with exactly
 * these rules (`parseEnvLines`): a line is trimmed, blank lines and `#` lines
 * are skipped, the key is everything before the first `=` and the value is
 * **everything after it, byte for byte**. There is no quote or escape
 * processing anywhere on the way into a container's environment, so the CLI
 * does not add any: `env set KEY="a b"` stores `a b` (the shell already
 * removed the quotes), and a literal `"` or `#` inside a value stays.
 */

/** Valid environment variable name (same as the API). */
export const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/

/** Max size of one environment's text (the API limit). */
export const ENV_TEXT_MAX = 20_000

export type EnvPair = [key: string, value: string]

/** The API's `parseEnvLines`: skips blanks, comments and lines without a key. */
export function parseEnvLines(text: string): EnvPair[] {
  const out: EnvPair[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    out.push([line.slice(0, eq).trim(), line.slice(eq + 1)])
  }

  return out
}

/** Variable names in order, without duplicates. */
export function keysOf(text: string): string[] {
  return [...new Set(parseEnvLines(text).map(([k]) => k))]
}

/** Variables as a record; when a key repeats the last definition wins (like a container's env). */
export function toRecord(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of parseEnvLines(text)) out[k] = v
  return out
}

/** Whether any value holds a `${{...}}` reference, which only the panel resolves at deploy time. */
export function hasReferences(text: string): boolean {
  return parseEnvLines(text).some(([, v]) => v.includes('${{'))
}

/** Shown when pulled or revealed values hold `${{...}}` references (only the panel resolves them). */
// eslint-disable-next-line no-template-curly-in-string
export const REFERENCE_NOTE = 'Some values contain ${{...}} references; aoox resolves those at deploy time, so they are used as stored.'

export class EnvInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EnvInputError'
  }
}

/** Why a value cannot be stored, or null. */
export function valueProblem(key: string, value: string): null | string {
  if (/[\n\r\0]/.test(value)) {
    return `${key}: multi-line values are not supported (one variable per line)`
  }

  if (value !== value.trimEnd()) {
    return `${key}: the value ends with whitespace, which the panel trims; remove it`
  }

  return null
}

function badName(name: string): EnvInputError {
  return new EnvInputError(
    `"${name.slice(0, 40)}" is not a valid variable name (letters, digits and _, not starting with a digit).`,
  )
}

/**
 * `KEY=VALUE` arguments as the shell passed them. The first `=` splits, so
 * `URL=a=b` is key `URL`, value `a=b`; `KEY=` sets an empty value. Throws
 * `EnvInputError` naming the first bad argument; when a key repeats the last
 * one wins.
 */
export function parseAssignments(args: string[]): EnvPair[] {
  if (args.length === 0) throw new EnvInputError('Pass at least one KEY=VALUE.')
  const map = new Map<string, string>()
  for (const arg of args) {
    const eq = arg.indexOf('=')
    if (eq === -1) {
      throw new EnvInputError(`"${arg.slice(0, 40)}" is not KEY=VALUE (use KEY= to set an empty value).`)
    }

    const key = arg.slice(0, eq)
    if (!ENV_NAME.test(key)) throw badName(key)
    const value = arg.slice(eq + 1)
    const problem = valueProblem(key, value)
    if (problem) throw new EnvInputError(problem)
    map.set(key, value)
  }

  return [...map]
}

/** Names for `unset`, validated and deduplicated. */
export function parseKeys(args: string[]): string[] {
  if (args.length === 0) throw new EnvInputError('Pass at least one variable name.')
  for (const k of args) {
    if (k.includes('=')) throw new EnvInputError(`"${k.split('=')[0]}": pass only the name, not KEY=VALUE.`)
    if (!ENV_NAME.test(k)) throw badName(k)
  }

  return [...new Set(args)]
}

/** Does this line define `key` (same trimming as `parseEnvLines`)? */
function definesKey(line: string, key: string): boolean {
  const t = line.trim()
  if (!t || t.startsWith('#')) return false
  const eq = t.indexOf('=')
  return eq > 0 && t.slice(0, eq).trim() === key
}

export interface SetResult {
  added: string[]
  text: string
  updated: string[]
}

/**
 * Read-modify-write that keeps the user's comments, blank lines and order:
 * an existing variable is replaced **in place** (a repeated definition below
 * it is dropped), a new one is appended at the end. Line endings are
 * normalised to `\n`.
 */
export function setVariables(text: string, pairs: EnvPair[]): SetResult {
  let lines = text === '' ? [] : text.split(/\r?\n/)
  const added: string[] = []
  const updated: string[] = []
  for (const [key, value] of pairs) {
    const at = lines.findIndex((l) => definesKey(l, key))
    if (at === -1) {
      // Keep a trailing blank line out of the way of the appended variable.
      while (lines.length > 0 && lines.at(-1)!.trim() === '') lines.pop()
      lines.push(`${key}=${value}`)
      added.push(key)
    } else {
      lines = lines.filter((l, i) => i <= at || !definesKey(l, key))
      lines[at] = `${key}=${value}`
      updated.push(key)
    }
  }

  return {added, text: lines.join('\n'), updated}
}

export interface UnsetResult {
  missing: string[]
  removed: string[]
  text: string
}

/** Removes every definition of the keys; comments and other lines stay. */
export function unsetVariables(text: string, keys: string[]): UnsetResult {
  let lines = text === '' ? [] : text.split(/\r?\n/)
  const removed: string[] = []
  const missing: string[] = []
  for (const key of keys) {
    const before = lines.length
    lines = lines.filter((l) => !definesKey(l, key))
    if (lines.length < before) removed.push(key)
    else missing.push(key)
  }

  return {missing, removed, text: lines.join('\n')}
}

// ---------------------------------------------------------------------------
// Stage 3: file validation (push, run --file), change summary, output formats
// ---------------------------------------------------------------------------

/** Key-level difference between two texts. Names only. */
export interface ChangeSummary {
  added: string[]
  changed: string[]
  removed: string[]
  /** How many variables are identical on both sides. */
  unchanged: number
}

/** Added, changed and removed variable names between two texts (last definition wins, like a container's env). */
export function summarizeChange(oldText: string, newText: string): ChangeSummary {
  const before = new Map(parseEnvLines(oldText))
  const after = new Map(parseEnvLines(newText))
  const added: string[] = []
  const changed: string[] = []
  let unchanged = 0
  for (const [key, value] of after) {
    if (!before.has(key)) added.push(key)
    else if (before.get(key) === value) unchanged++
    else changed.push(key)
  }

  const removed = [...before.keys()].filter((k) => !after.has(k))
  return {added, changed, removed, unchanged}
}

/** Whether a summary holds no change at all. */
export function isEmptyChange(s: ChangeSummary): boolean {
  return s.added.length + s.changed.length + s.removed.length === 0
}

export interface EnvFileCheck {
  /** Lines that cannot be stored, each worded for the user (empty = valid). */
  problems: string[]
  /** The text to upload: LF endings, no BOM, no trailing blank lines. */
  text: string
  /** Things that are accepted but worth knowing. */
  warnings: string[]
}

/**
 * Validates the content of a `.env` file the way the panel will, line by
 * line, so a bad line is named before anything is sent. Same rules as
 * `env set` (names, trailing whitespace) plus: no `export ` prefix, no
 * repeated names. Comments and blank lines are fine and kept.
 */
export function checkEnvFile(raw: string): EnvFileCheck {
  const text = raw.replace(/^\uFEFF/, '').replaceAll('\r\n', '\n').replace(/\n+$/, '')
  const problems: string[] = []
  const warnings: string[] = []
  const seen = new Map<string, number>()
  for (const [i, line] of text.split('\n').entries()) {
    const n = i + 1
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    if (/[\0\r]/.test(line)) {
      problems.push(`Line ${n}: contains a control character`)
      continue
    }

    const eq = trimmed.indexOf('=')
    if (eq <= 0) {
      problems.push(`Line ${n}: expected NAME=value`)
      continue
    }

    const key = trimmed.slice(0, eq).trim()
    if (/^export\s/.test(key)) {
      problems.push(`Line ${n}: remove "export" (write NAME=value)`)
      continue
    }

    if (!ENV_NAME.test(key)) {
      problems.push(`Line ${n}: "${key.slice(0, 40)}" is not a valid variable name (letters, digits and _, not starting with a digit)`)
      continue
    }

    if (line !== line.trimEnd()) {
      problems.push(`Line ${n}: ${key} ends with whitespace, which the panel trims; remove it`)
      continue
    }

    if (seen.has(key)) {
      problems.push(`Line ${n}: ${key} is already defined on line ${seen.get(key)}`)
      continue
    }

    seen.set(key, n)
    const value = trimmed.slice(eq + 1)
    if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
      warnings.push(`Line ${n}: ${key} is quoted; aoox stores the quotes as part of the value (it does no quote processing)`)
    }
  }

  if (text.length > ENV_TEXT_MAX) problems.push(`The file is longer than ${ENV_TEXT_MAX} characters`)
  return {problems, text, warnings}
}

/** `'` + value with every `'` written as `'\''` + `'`: safe for any POSIX shell. */
export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", String.raw`'\''`)}'`
}

/** `export KEY='value'` lines for `eval` in a POSIX shell. Names that are not valid shell identifiers are skipped. */
export function toShell(text: string): string {
  const rec = toRecord(text)
  const lines = Object.entries(rec)
    .filter(([k]) => ENV_NAME.test(k))
    .map(([k, v]) => `export ${k}=${shellQuote(v)}`)
  return lines.length === 0 ? '' : `${lines.join('\n')}\n`
}

/** The variables as pretty JSON (`{"KEY": "value"}`), in file order. */
export function toJson(text: string): string {
  return `${JSON.stringify(toRecord(text), null, 2)}\n`
}

export type PullFormat = 'dotenv' | 'json' | 'shell'

/** Renders revealed text in the requested format; dotenv is the stored text verbatim. */
export function formatEnv(text: string, format: PullFormat): string {
  switch (format) {
    case 'json': {
      return toJson(text)
    }

    case 'shell': {
      return toShell(text)
    }

    default: {
      return text === '' || text.endsWith('\n') ? text : `${text}\n`
    }
  }
}

/** Default file name per format when `--file` is not given. */
export function defaultFileFor(format: PullFormat): string {
  return format === 'json' ? '.env.json' : format === 'shell' ? '.env.sh' : '.env'
}
