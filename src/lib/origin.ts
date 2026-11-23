import type {CliConfig} from './config.js'

import {normalizeUrl} from './config.js'

/**
 * The API's websocket gateways only accept a handshake whose `Origin` is the
 * dashboard (`WEB_ORIGIN`). A browser sets that header itself; the CLI has to
 * send it, so it needs the dashboard address, which `aoox login` stores as
 * `webUrl`. Returns the dashboard address for the panel the request goes to,
 * or null when it cannot be told (a login saved by an older CLI that typed
 * the API address).
 *
 * `rawUrl` is `--url` / `AOOX_URL` as typed (a dashboard address, normally);
 * `discover` is injected so the lookup can be tested without a network.
 */
export async function dashboardUrlFor(
  stored: CliConfig | null,
  apiUrl: string,
  rawUrl: string | undefined,
  discover: (input: string) => Promise<{webUrl: null | string}>,
): Promise<null | string> {
  if (rawUrl) {
    const wanted = normalizeUrl(rawUrl)
    if (stored && wanted === stored.webUrl) return stored.webUrl
    // The stored API address typed as --url says nothing new about the dashboard.
    if (stored && wanted === stored.url) return stored.webUrl ?? null
    return (await discover(rawUrl)).webUrl
  }

  if (stored && normalizeUrl(apiUrl) === stored.url) return stored.webUrl ?? null
  return null
}

/** `https://dash.example.com/` -> `https://dash.example.com` (what a browser sends as `Origin`). */
export function originOf(dashboardUrl: string): string {
  return new URL(dashboardUrl).origin
}
