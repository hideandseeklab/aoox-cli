import type {CliConfig} from './config.js'
import type {AuthUser} from './types.js'

import {api} from './api.js'
import {outdatedCliWarning} from './version.js'

/**
 * One cheap, best-effort `GET /auth/me` (the API reports its version there)
 * to tell the user their CLI is behind the panel. Never throws: an old panel,
 * a slow network or a bad token must not turn a working command into a failure.
 */
export async function panelVersion(config: Pick<CliConfig, 'token' | 'url'>): Promise<string | undefined> {
  try {
    const me = await api<AuthUser>(config, '/auth/me', {timeoutMs: 3000})
    return me.version
  } catch {
    return undefined
  }
}

/** Print the warning when the panel is newer than the CLI; silent otherwise. */
export async function warnIfOutdated(
  log: (message: string) => void,
  cliVersion: string,
  config: Pick<CliConfig, 'token' | 'url'>,
  knownPanelVersion?: string,
): Promise<void> {
  const version = knownPanelVersion ?? (await panelVersion(config))
  const warning = outdatedCliWarning(cliVersion, version)
  if (warning) log(warning)
}
