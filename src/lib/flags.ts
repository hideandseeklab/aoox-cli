import {Flags} from '@oclif/core'

import type {CliConfig} from './config.js'

import {readConfig, resolveCredentials} from './config.js'

/**
 * Shared by every command that talks to the panel. The `env` option is
 * oclif's own way of reading environment variables, so CI can skip
 * `aoox login` entirely and the fallback still shows up in `--help`.
 */
export const connectionFlags = {
  token: Flags.string({
    char: 't',
    description: 'API token (aoox_…); default dari hasil `aoox login`',
    env: 'AOOX_TOKEN',
  }),
  url: Flags.string({
    char: 'u',
    description: 'URL panel aoox; default dari hasil `aoox login`',
    env: 'AOOX_URL',
  }),
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
  return resolveCredentials({file, token: flags.token, url: flags.url ?? defaultUrl})
}
