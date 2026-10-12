import {Flags} from '@oclif/core'

import type {CliConfig} from './config.js'

import {normalizeUrl, readConfig, resolveCredentials} from './config.js'
import {discover} from './discovery.js'

/**
 * Shared by every command that talks to the panel. The `env` option is
 * oclif's own way of reading environment variables, so CI can skip
 * `aoox login` entirely and the fallback still shows up in `--help`.
 */
export const connectionFlags = {
  token: Flags.string({
    char: 't',
    description: 'API token (aoox_…); defaults to the value from `aoox login`',
    env: 'AOOX_TOKEN',
  }),
  url: Flags.string({
    char: 'u',
    description:
      'Dashboard URL (the address you open the dashboard with, e.g. https://dashboard.example.com); defaults to the value from `aoox login`',
    env: 'AOOX_URL',
  }),
}

/**
 * `--url`/`AOOX_URL` is the **dashboard** address; requests go to the API
 * it advertises. The API address itself is accepted too (older scripts).
 * The stored login is matched by either address first, so the common case
 * costs no network call.
 */
export async function resolveApiUrl(file: CliConfig | null, raw: string): Promise<string> {
  const wanted = normalizeUrl(raw)
  if (file && (wanted === file.url || (file.webUrl && wanted === file.webUrl))) return file.url
  return (await discover(raw)).apiUrl
}

/**
 * Stored config merged with flags/environment; throws when neither has
 * enough. `defaultUrl` is used when neither `--url` nor `AOOX_URL` is
 * set — `aoox deploy`/`aoox logs` pass the URL from `.aoox.json` here,
 * so a linked repo works without also being logged in against that exact
 * host as the *last* one `aoox login` ran against.
 */
export async function loadCredentials(
  configDir: string,
  flags: {token?: string; url?: string},
  defaultUrl?: string,
): Promise<CliConfig> {
  const file = await readConfig(configDir)
  const raw = flags.url ?? defaultUrl
  const url = raw ? await resolveApiUrl(file, raw) : undefined
  return resolveCredentials({file, token: flags.token, url})
}
