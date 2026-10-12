import {lookup} from 'node:dns/promises'
import {isIP} from 'node:net'

import {DEFAULT_API_PORT, DEFAULT_WEB_PORT, DISCOVERY_PATH, isLoopbackHost, parseDiscovery} from './discovery.js'

/** One panel endpoint as shown by plain `aoox`: the direct IP address and/or the panel domain. */
export interface Endpoint {
  /** Panel domain host, e.g. `dashboard.example.com`. */
  domain?: string
  /** Direct address, e.g. `http://203.0.113.7:3000`. */
  ip?: string
}

export interface PanelAddresses {
  api: Endpoint
  dashboard: Endpoint
  /** The server's IP, set only once the panel answered on it. */
  serverIp?: string
}

type FetchFn = typeof fetch
type LookupFn = (host: string) => Promise<string>

const TIMEOUT_MS = 1500

const hostOf = (url: string): string => new URL(url).hostname.replaceAll(/^\[|\]$/g, '')
const isIpUrl = (url: string): boolean => isIP(hostOf(url)) !== 0
const isUsable = (url: string): boolean => !isLoopbackHost(hostOf(url))
const ipBase = (ip: string, port: number): string => `http://${isIP(ip) === 6 ? `[${ip}]` : ip}:${port}`

async function getJson(fetchFn: FetchFn, url: string): Promise<unknown> {
  const response = await fetchFn(url, {cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS)})
  if (!response.ok) return null
  return response.json()
}

/** First non-loopback IP address and first domain among the candidate URLs. */
function pick(urls: string[]): Endpoint {
  const usable = urls.filter((u) => isUsable(u))
  const ip = usable.find((u) => isIpUrl(u))
  const domain = usable.find((u) => !isIpUrl(u))
  return {...(ip ? {ip} : {}), ...(domain ? {domain: hostOf(domain)} : {})}
}

const defaultLookup: LookupFn = async (host) => (await lookup(host)).address

/**
 * Splits what the CLI knows about the panel into "IP" and "domain" per endpoint. Sources, in order:
 * the stored login (`url` = API, `webUrl` = dashboard), the dashboard's discovery file (it advertises
 * the panel domain once one is set), and, when only a domain is known, its DNS address — used only
 * after that IP answers as aoox on the default port, so a CDN or proxy address is never shown.
 * Never throws; unknown parts are left out.
 */
export async function resolvePanelAddresses(
  config: {url: string; webUrl?: string},
  fetchFn: FetchFn = fetch,
  lookupFn: LookupFn = defaultLookup,
): Promise<PanelAddresses> {
  const webCandidates = config.webUrl ? [config.webUrl] : []
  const apiCandidates = [config.url]

  if (config.webUrl) {
    try {
      const doc = parseDiscovery(await getJson(fetchFn, `${config.webUrl}${DISCOVERY_PATH}`))
      if (doc?.webUrl) webCandidates.push(doc.webUrl)
      if (doc?.apiUrl) apiCandidates.push(doc.apiUrl)
    } catch {
      // Dashboard unreachable: show what is stored.
    }
  }

  const dashboard = pick(webCandidates)
  const api = pick(apiCandidates)
  const serverIp = await findServerIp(dashboard, api, lookupFn)

  if (serverIp) {
    const checks: Promise<void>[] = []
    // Also covers a login saved without a dashboard address: the panel serves it on the same server.
    if (!dashboard.ip) {
      const base = ipBase(serverIp, DEFAULT_WEB_PORT)
      checks.push(
        getJson(fetchFn, `${base}${DISCOVERY_PATH}`)
          .then((json) => {
            const doc = parseDiscovery(json)
            if (!doc) return
            dashboard.ip = base
            if (!dashboard.domain && doc.webUrl && isUsable(doc.webUrl) && !isIpUrl(doc.webUrl)) {
              dashboard.domain = hostOf(doc.webUrl)
            }

            if (!api.domain && isUsable(doc.apiUrl) && !isIpUrl(doc.apiUrl)) api.domain = hostOf(doc.apiUrl)
          })
          .catch(() => {}),
      )
    }

    if (!api.ip && api.domain) {
      const base = ipBase(serverIp, DEFAULT_API_PORT)
      checks.push(
        getJson(fetchFn, `${base}/`)
          .then((json) => {
            if ((json as null | {description?: unknown})?.description === 'aoox api') api.ip = base
          })
          .catch(() => {}),
      )
    }

    await Promise.all(checks)
  }

  const confirmed = dashboard.ip || api.ip ? serverIp : null
  return {api, dashboard, ...(confirmed ? {serverIp: confirmed} : {})}
}

/**
 * The server's IP: taken from an IP address the CLI already uses, else the DNS address of the panel
 * domain (the caller only shows it after it answers as aoox). Null when unknown or loopback.
 */
async function findServerIp(dashboard: Endpoint, api: Endpoint, lookupFn: LookupFn): Promise<null | string> {
  const known = dashboard.ip ?? api.ip
  let ip: null | string = known ? hostOf(known) : null
  const domain = dashboard.domain ?? api.domain
  if (!ip && domain) {
    try {
      ip = await lookupFn(domain)
    } catch {
      ip = null
    }
  }

  return ip && !isLoopbackHost(ip) ? ip : null
}

/**
 * Direct address of the self-hosted registry (`http://<server IP>:<registry port>`), from the port
 * in its public address (`GET /registries/self-hosted` → `publicUrl`, e.g. `localhost:5000`). Shown
 * only when that address answers as a Docker registry (`/v2/` with the Distribution API header).
 */
export async function resolveRegistryIp(
  serverIp: string,
  publicUrl: string,
  fetchFn: FetchFn = fetch,
): Promise<null | string> {
  const port = /:(\d{1,5})$/.exec(publicUrl)?.[1]
  if (!port) return null
  const base = ipBase(serverIp, Number(port))
  try {
    const response = await fetchFn(`${base}/v2/`, {cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS)})
    return response.headers.has('docker-distribution-api-version') ? base : null
  } catch {
    return null
  }
}

/** `http://203.0.113.7:3000 - dashboard.example.com`, or whichever part is known; null when neither. */
export function formatEndpoint(endpoint: Endpoint): null | string {
  if (endpoint.ip && endpoint.domain) return `${endpoint.ip} - ${endpoint.domain}`
  return endpoint.ip ?? endpoint.domain ?? null
}
