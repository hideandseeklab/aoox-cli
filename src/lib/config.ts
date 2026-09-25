import {chmod, mkdir, readFile, writeFile} from 'node:fs/promises'
import {dirname, join} from 'node:path'

/**
 * What `aoox login` stores. The token is a platform API token (`aoox_…`)
 * created in the panel under Settings → Akun; it acts as its owner.
 */
export interface CliConfig {
  token: string
  url: string
}

export const CONFIG_FILE = 'config.json'

/** Lives in oclif's own config dir (`dirname` in package.json → `aoox`). */
export function configPath(configDir: string): string {
  return join(configDir, CONFIG_FILE)
}

/** Trailing slashes would double up once request paths are appended. */
export function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

export async function readConfig(configDir: string): Promise<CliConfig | null> {
  const path = configPath(configDir)
  let raw: string
  try {
    raw = await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }

  try {
    const parsed = JSON.parse(raw) as Partial<CliConfig>
    if (!parsed.url || !parsed.token) return null
    return {token: parsed.token, url: normalizeUrl(parsed.url)}
  } catch {
    throw new Error(`Config rusak (bukan JSON yang sah): ${path}`)
  }
}

export async function writeConfig(configDir: string, config: CliConfig): Promise<string> {
  const path = configPath(configDir)
  await mkdir(dirname(path), {recursive: true})
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, {mode: 0o600})
  // The mode above only applies when the file is created, so an existing
  // file keeps its old permissions — tighten it explicitly. Windows ACLs
  // do not map onto POSIX modes, so a failure here is not worth reporting.
  try {
    await chmod(path, 0o600)
  } catch {
    /* ignore */
  }

  return path
}

export class MissingCredentialsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MissingCredentialsError'
  }
}

export interface CredentialInput {
  /** Stored config, or null when the user has never logged in. */
  file: CliConfig | null
  /** From `--token` / `AOOX_TOKEN`. */
  token?: string
  /** From `--url` / `AOOX_URL`. */
  url?: string
}

/**
 * Flags and environment win over the stored config, per field — except that
 * a stored token is never sent to a *different* panel than the one it was
 * saved for: pointing `--url` somewhere else without passing a token would
 * hand that host a working credential.
 */
export function resolveCredentials({file, token, url}: CredentialInput): CliConfig {
  const resolvedUrl = normalizeUrl(url ?? file?.url ?? '')
  if (!resolvedUrl) {
    throw new MissingCredentialsError('Belum ada URL panel. Jalankan `aoox login` dulu.')
  }

  let resolvedToken = token?.trim()
  if (!resolvedToken && file) {
    const sameHost = !url || normalizeUrl(url) === normalizeUrl(file.url)
    if (sameHost) resolvedToken = file.token
  }

  if (!resolvedToken) {
    throw new MissingCredentialsError(
      url && file
        ? `Tidak ada token untuk ${resolvedUrl} (token tersimpan milik ${normalizeUrl(file.url)}). Beri --token, atau login ke URL itu.`
        : 'Belum ada API token. Jalankan `aoox login` dulu.',
    )
  }

  return {token: resolvedToken, url: resolvedUrl}
}
