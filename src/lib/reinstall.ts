import {buildEnvFile} from './install-env.js'

/** Secrets `aoox reinstall` must never invent — losing them means the old database/credentials are unreachable. */
export const REQUIRED_SECRETS = ['POSTGRES_PASSWORD', 'JWT_SECRET', 'ENCRYPTION_KEY'] as const

/**
 * Keys `buildEnvFile` writes that are specific to one installation (or a
 * secret). A repair never adds these: it can't know the right value, and the
 * compose file already has a safe fallback for the ones it reads.
 */
const NEVER_ADDED = new Set([
  'ADMIN_EMAIL',
  'ADMIN_NAME',
  'ADMIN_PASSWORD',
  'API_DOMAIN',
  'ENCRYPTION_KEY',
  'JWT_SECRET',
  'POSTGRES_PASSWORD',
  'PROXY_ACME_EMAIL',
  'PUBLIC_API_URL',
  'PUBLIC_IP',
  'WEB_DOMAIN',
  'WEB_ORIGIN',
])

export class MissingSecretsError extends Error {
  readonly missing: string[]

  constructor(missing: string[]) {
    super(
      `.env.dist tidak punya ${missing.join(', ')}. Ini rahasia yang tidak boleh dibuat ulang (akses ke database/kredensial lama akan putus) — pulihkan dari backup Anda lalu ulangi.`,
    )
    this.missing = missing
    this.name = 'MissingSecretsError'
  }
}

/** Active (non-comment) `KEY=value` lines. Later duplicates win, as in `docker compose --env-file`. */
export function parseEnv(text: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line)
    if (m) out.set(m[1], m[2])
  }

  return out
}

/** Every `${VAR}` / `${VAR:-x}` / `${VAR:?msg}` the given compose texts read. */
export function composeVariables(...composeTexts: string[]): Set<string> {
  const referenced = new Set<string>()
  for (const text of composeTexts) {
    for (const m of text.matchAll(/\$\{([A-Z_][A-Z0-9_]*)(?::[?-][^}]*)?\}/g)) referenced.add(m[1])
  }

  return referenced
}

/** `${VAR:-default}` fallbacks the compose files already apply (first occurrence wins). */
export function composeDefaults(...composeTexts: string[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const text of composeTexts) {
    for (const m of text.matchAll(/\$\{([A-Z_][A-Z0-9_]*):-([^}]*)\}/g)) if (!out.has(m[1])) out.set(m[1], m[2])
  }

  return out
}

export interface DefaultsContext {
  dockerGid: string
  installDir: string
}

/**
 * The safe-default values a repair may add, taken from `buildEnvFile` (the
 * single source of truth for what a fresh install writes) and restricted to
 * keys the bundled compose actually reads.
 */
export function repairDefaults(composeVars: Set<string>, ctx: DefaultsContext, fallbacks = new Map<string, string>()): Map<string, string> {
  const fresh = parseEnv(
    buildEnvFile({
      dockerGid: ctx.dockerGid,
      encryptionKey: 'x',
      installDir: ctx.installDir,
      jwtSecret: 'x',
      postgresPassword: 'x',
      publicApiUrl: 'x',
      webOrigin: 'x',
    }),
  )
  const out = new Map<string, string>()
  for (const [key, value] of fresh) {
    // A value equal to the compose's own fallback changes nothing — skip the noise.
    if (composeVars.has(key) && !NEVER_ADDED.has(key) && fallbacks.get(key) !== value) out.set(key, value)
  }

  return out
}

export interface MergeResult {
  /** Keys appended (in file order) — does not include overrides of existing keys. */
  added: string[]
  content: string
  /** Existing keys whose value was replaced by an explicit override. */
  overridden: string[]
  warnings: string[]
}

/**
 * Merges `defaults` into an existing `.env.dist` without regenerating anything:
 * every existing line (values, order, comments, unknown keys) is kept byte for
 * byte; missing keys are appended at the end; `overrides` (explicit user
 * flags) replace the value of an existing key in place. Refuses when a required
 * secret is absent — see {@link REQUIRED_SECRETS}.
 */
export function mergeEnv(
  existing: string,
  defaults: Map<string, string>,
  overrides: Record<string, string> = {},
  stamp = new Date().toISOString(),
): MergeResult {
  const present = parseEnv(existing)
  const missing = REQUIRED_SECRETS.filter((k) => !present.get(k))
  if (missing.length > 0) throw new MissingSecretsError(missing)

  const overridden: string[] = []
  let content = existing
  for (const [key, value] of Object.entries(overrides)) {
    if (present.has(key)) {
      if (present.get(key) !== value) {
        content = replaceLastAssignment(content, key, value)
        overridden.push(key)
      }
    } else {
      defaults = new Map(defaults).set(key, value)
    }
  }

  const added = [...defaults.keys()].filter((k) => !present.has(k))
  if (added.length > 0) {
    if (!content.endsWith('\n')) content += '\n'
    content += `\n# Added by \`aoox reinstall\` (${stamp}).\n`
    for (const key of added) content += `${key}=${overrides[key] ?? defaults.get(key)}\n`
  }

  const warnings: string[] = []
  const sshUser = parseEnv(content).get('TERMINAL_SSH_USER')
  if (sshUser === '') {
    warnings.push('TERMINAL_SSH_USER kosong — Terminal web akan error. Isi lewat --terminal-ssh-user atau Settings → Environment.')
  }

  return {added, content, overridden, warnings}
}

function replaceLastAssignment(text: string, key: string, value: string): string {
  const lines = text.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    if (new RegExp(`^\\s*${key}=`).test(lines[i])) {
      lines[i] = `${key}=${value}`
      break
    }
  }

  return lines.join('\n')
}

export const DIST_FILE = 'docker-compose.dist.yml'
export const DOMAIN_FILE = 'docker-compose.domain.yml'
export const OVERRIDE_FILE = 'docker-compose.override.yml'

export interface ComposeFilesInput {
  /** Which compose files exist in the install folder (basenames). */
  present: Iterable<string>
  /** `com.docker.compose.project.config_files` of the running api container, if any. */
  runningConfigFiles?: string
}

/**
 * Which `-f` files to pass. Preferred: exactly the set the running stack was
 * started with (same basenames, only those still present, dist always first).
 * Fallback: dist, the manual domain override if the folder has it, then
 * `docker-compose.override.yml` if present — Compose only auto-includes that
 * one when the main file is literally `docker-compose.yml`, so it must be
 * passed explicitly.
 */
/** Basenames listed in the running stack's `config_files` label, in order. */
export function runningFileNames(configFiles?: string): string[] {
  if (!configFiles) return []
  return configFiles
    .split(',')
    .map((p) => p.trim().split(/[/\\]/).pop() ?? '')
    .filter(Boolean)
}

export function chooseComposeFiles({present, runningConfigFiles}: ComposeFilesInput): string[] {
  const have = new Set(present)
  if (runningConfigFiles) {
    const fromRunning = runningFileNames(runningConfigFiles).filter((name) => have.has(name))
    if (fromRunning.includes(DIST_FILE)) {
      return [DIST_FILE, ...fromRunning.filter((n) => n !== DIST_FILE)]
    }
  }

  return [DIST_FILE, ...[DOMAIN_FILE, OVERRIDE_FILE].filter((n) => have.has(n))]
}

export function composeArgs(files: string[], ...rest: string[]): string[] {
  return ['compose', ...files.flatMap((f) => ['-f', f]), '--env-file', '.env.dist', ...rest]
}

function count(text: string): Map<string, number> {
  const m = new Map<string, number>()
  const normalized = text.replaceAll(String.fromCodePoint(13), '')
  for (const line of normalized.split(String.fromCodePoint(10))) {
    m.set(line, (m.get(line) ?? 0) + 1)
  }

  return m
}

/** Line-set diff (not an LCS diff — enough for "what changed" in a dry-run). */
export function summarizeDiff(before: string, after: string, max = 30): {added: number; lines: string[]; removed: number} {
  const b = count(before)
  const a = count(after)
  const lines: string[] = []
  let removed = 0
  let added = 0
  for (const [l, n] of b) {
    const extra = n - (a.get(l) ?? 0)
    for (let i = 0; i < extra; i++) {
      removed++
      if (l.trim()) lines.push(`- ${l}`)
    }
  }

  for (const [l, n] of a) {
    const extra = n - (b.get(l) ?? 0)
    for (let i = 0; i < extra; i++) {
      added++
      if (l.trim()) lines.push(`+ ${l}`)
    }
  }

  const shown = lines.slice(0, max)
  if (lines.length > max) shown.push(`… (${lines.length - max} baris lagi)`)
  return {added, lines: shown, removed}
}

export function backupStamp(d = new Date()): string {
  return d.toISOString().replaceAll(/[:.]/g, '-')
}
