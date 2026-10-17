import {isIP} from 'node:net'
import tls from 'node:tls'

import {normalizeUrl} from './config.js'

/** What `GET <dashboard>/.well-known/aoox.json` answers (aoox-web). */
export interface DiscoveryDocument {
  apiUrl: string
  version?: string
  webUrl?: string
}

export interface Discovered {
  /** Base URL of the API — what every other command talks to. */
  apiUrl: string
  /** One-line remarks worth printing (API URL given, localhost fallback). */
  notes: string[]
  /** Web app version from the discovery file, when present. */
  version?: string
  /** Dashboard address that was reached; null when the user gave an API URL. */
  webUrl: null | string
}

export type Failure = 'invalid-url' | 'not-aoox' | 'plain-http' | 'timeout' | 'tls' | 'unreachable'

export class DiscoveryError extends Error {
  readonly failure: Failure

  constructor(failure: Failure, message: string) {
    super(message)
    this.failure = failure
    this.name = 'DiscoveryError'
  }
}

export const DISCOVERY_PATH = '/.well-known/aoox.json'
export const DEFAULT_WEB_PORT = 3000
export const DEFAULT_API_PORT = 3001
const PROBE_TIMEOUT_MS = 6000

const TLS_CODES = new Set([
  'CERT_HAS_EXPIRED',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
])

/** Codes meaning "the chain ends in an authority Node does not know" (antivirus / proxy re-signing, private CA). */
const UNKNOWN_ISSUER_CODES = new Set([
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
])

/** The Node error code of a failed `fetch` (undici puts it on `cause`). */
export function errorCode(error: unknown): string {
  const err = error as {cause?: {code?: string}; code?: string}
  return err?.cause?.code ?? err?.code ?? ''
}

/** `localhost`, `127.x`, `::1` — an API URL like this is useless from another machine. */
export function isLoopbackHost(hostname: string): boolean {
  const host = hostname.replaceAll(/^\[|\]$/g, '').toLowerCase()
  return host === 'localhost' || host === '::1' || host.startsWith('127.') || host === '0.0.0.0'
}

function hostForUrl(hostname: string): string {
  return hostname.includes(':') && !hostname.startsWith('[') ? `[${hostname}]` : hostname
}

/**
 * Turn what the user typed into the base URLs worth trying, in order.
 * A scheme pins the scheme; a bare host/IP tries https first, then http.
 * An IP (or localhost) without a port also tries the dashboard's default
 * port 3000, which is where a fresh install without a panel domain listens.
 */
export function candidateUrls(raw: string): string[] {
  const text = raw.trim()
  if (!text || /\s/.test(text)) throw new DiscoveryError('invalid-url', `"${text}" is not a valid address.`)

  const schemeMatch = /^([a-z][\d+.a-z-]*):\/\//i.exec(text)
  const scheme = schemeMatch?.[1].toLowerCase()
  if (scheme && scheme !== 'http' && scheme !== 'https') {
    throw new DiscoveryError('invalid-url', `Only http:// and https:// addresses are supported (got ${scheme}://).`)
  }

  let parsed: URL
  try {
    parsed = new URL(scheme ? text : `http://${text}`)
  } catch {
    throw new DiscoveryError('invalid-url', `"${text}" is not a valid address.`)
  }

  const hasPort = parsed.port !== ''
  const host = hostForUrl(parsed.hostname)
  const path = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, '')
  const schemes = scheme ? [scheme] : ['https', 'http']
  const bare = parsed.hostname.replaceAll(/^\[|\]$/g, '')
  const defaultPortToo = !hasPort && (isIP(bare) !== 0 || bare === 'localhost')

  const out: string[] = []
  for (const s of schemes) out.push(`${s}://${host}${hasPort ? `:${parsed.port}` : ''}${path}`)

  // A fresh install is plain HTTP; no point trying TLS on 3000 when the user did not ask for it.
  if (defaultPortToo) out.push(`http://${host}:${DEFAULT_WEB_PORT}${path}`)

  return [...new Set(out)]
}

/** Map a rejected `fetch` to a failure kind. */
// eslint-disable-next-line complexity
export function classifyFetchError(error: unknown, url: string): Failure {
  const err = error as {cause?: {code?: string; message?: string}; code?: string; message?: string; name?: string}
  const code = err?.cause?.code ?? err?.code ?? ''
  const text = `${err?.cause?.message ?? ''} ${err?.message ?? ''}`.toLowerCase()

  if (
    err?.name === 'TimeoutError' ||
    err?.name === 'AbortError' ||
    code === 'UND_ERR_CONNECT_TIMEOUT' ||
    code === 'ETIMEDOUT'
  ) {
    return 'timeout'
  }

  if (
    url.startsWith('https:') &&
    (code === 'ERR_SSL_WRONG_VERSION_NUMBER' ||
      text.includes('wrong version number') ||
      text.includes('packet length too long') ||
      text.includes('http request') ||
      // Node's wording when a plain HTTP server drops a TLS handshake.
      text.includes('before secure tls connection was established'))
  ) {
    return 'plain-http'
  }

  if (TLS_CODES.has(code) || text.includes('certificate') || text.includes('self-signed') || text.includes('self signed')) {
    return 'tls'
  }

  return 'unreachable'
}

export interface FailureDetail {
  /** Name of the CA that signed the certificate the server presented, when it could be read. */
  issuer?: null | string
  /** The failure is an unknown-issuer one (see `UNKNOWN_ISSUER_CODES`). */
  unknownIssuer?: boolean
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

/** The human sentence for a failure. `url` is the address that was tried. */
export function explainFailure(failure: Failure, url: string, detail: FailureDetail = {}): string {
  switch (failure) {
    case 'invalid-url': {
      return `"${url}" is not a valid address.`
    }

    case 'not-aoox': {
      return `${url} answers, but it does not look like an aoox dashboard. Use the address you open the dashboard with in your browser.`
    }

    case 'plain-http': {
      return `${url} answers plain HTTP, not HTTPS. Try ${url.replace(/^https:/, 'http:')} instead.`
    }

    case 'timeout': {
      return `Could not reach ${url} (no answer in time). Check the firewall / security group, or set a panel domain in the dashboard: Infrastructure → Panel domain.`
    }

    case 'tls': {
      if (detail.unknownIssuer) {
        const host = hostOf(url)
        const who = detail.issuer
          ? `was issued by "${detail.issuer}", which Node does not trust`
          : 'is signed by an authority Node does not trust'
        return `Could not verify ${url}: the certificate ${who}. An antivirus or proxy is probably inspecting HTTPS. Fix: add ${host} to the antivirus HTTPS-scanning exclusions, point NODE_EXTRA_CA_CERTS at that root certificate, or (older Node) set NODE_OPTIONS=--use-system-ca. On Node 22.19+ / 24.5+ aoox also trusts the system certificate store, unless AOOX_SYSTEM_CA=0.`
      }

      return `The TLS certificate of ${url} is not trusted (expired, self-signed or issued for another name). Fix the certificate, or use the http:// address if the panel has no domain yet.`
    }

    default: {
      return `Could not reach ${url}. Check the address and the firewall / security group, or set a panel domain in the dashboard: Infrastructure → Panel domain.`
    }
  }
}

/** Message for a failed request to an already known URL, without any network lookup. */
export function explainNetworkError(url: string, error: unknown): string {
  return explainFailure(classifyFetchError(error, url), url)
}

export type IssuerLookup = (url: string) => Promise<null | string>

/**
 * Read who signed the certificate a server presents, **only to name it in an
 * error message**. Certificate verification is switched off for this one
 * handshake because it already failed; nothing is ever written to the socket
 * (no request, no credentials) and it is destroyed as soon as the certificate
 * is read. Never throws; `null` when it cannot be read.
 */
export function peekIssuer(url: string, timeoutMs = 3000): Promise<null | string> {
  return new Promise((resolve) => {
    let target: URL
    try {
      target = new URL(url)
    } catch {
      resolve(null)
      return
    }

    if (target.protocol !== 'https:') {
      resolve(null)
      return
    }

    const host = target.hostname.replaceAll(/^\[|\]$/g, '')
    let socket: tls.TLSSocket | undefined
    const finish = (value: null | string) => {
      socket?.destroy()
      resolve(value)
    }

    try {
      socket = tls.connect({
        host,
        port: target.port ? Number(target.port) : 443,
        // Verification is skipped on purpose: this socket only reads the issuer name (see above).
        rejectUnauthorized: false,
        servername: isIP(host) === 0 ? host : undefined,
      })
    } catch {
      resolve(null)
      return
    }

    socket.setTimeout(timeoutMs, () => finish(null))
    socket.once('error', () => finish(null))
    socket.once('secureConnect', () => {
      const issuer = socket?.getPeerCertificate().issuer as undefined | {CN?: string | string[]; O?: string | string[]}
      const name = [issuer?.CN, issuer?.O].flat().find((v): v is string => typeof v === 'string' && v.trim() !== '')
      finish(name ?? null)
    })
  })
}

/**
 * Like `explainNetworkError`, but for an unknown-issuer certificate failure it
 * looks up the issuer once so the message can name it.
 */
export async function describeNetworkError(url: string, error: unknown, lookup: IssuerLookup = peekIssuer): Promise<string> {
  const failure = classifyFetchError(error, url)
  if (failure === 'tls' && UNKNOWN_ISSUER_CODES.has(errorCode(error))) {
    let issuer: null | string = null
    try {
      issuer = await lookup(url)
    } catch {
      issuer = null
    }

    return explainFailure('tls', url, {issuer, unknownIssuer: true})
  }

  return explainFailure(failure, url)
}

type FetchFn = typeof fetch

interface ProbeOk {
  doc?: DiscoveryDocument
  kind: 'api' | 'web'
}

async function getJson(fetchFn: FetchFn, url: string): Promise<{json: unknown; status: number}> {
  const response = await fetchFn(url, {
    headers: {accept: 'application/json', connection: 'close'},
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
  })
  const text = await response.text()
  let json: unknown
  try {
    json = text ? JSON.parse(text) : undefined
  } catch {
    json = undefined
  }

  return {json, status: response.status}
}

export function parseDiscovery(json: unknown): DiscoveryDocument | null {
  if (!json || typeof json !== 'object') return null
  const {apiUrl, version, webUrl} = json as Record<string, unknown>
  if (typeof apiUrl !== 'string') return null
  try {
    const u = new URL(apiUrl)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  } catch {
    return null
  }

  return {
    apiUrl: normalizeUrl(apiUrl),
    version: typeof version === 'string' ? version : undefined,
    webUrl: typeof webUrl === 'string' ? normalizeUrl(webUrl) : undefined,
  }
}

/** One base URL: dashboard discovery file first, then "is this the API itself?". */
async function probe(fetchFn: FetchFn, base: string): Promise<ProbeOk> {
  try {
    const {json, status} = await getJson(fetchFn, `${base}${DISCOVERY_PATH}`)
    const doc = status === 200 ? parseDiscovery(json) : null
    if (doc) return {doc, kind: 'web'}

    // Older scripts pass the API URL: setup-status is public JSON on the API only.
    const setup = await getJson(fetchFn, `${base}/auth/setup-status`)
    if (setup.status === 200 && setup.json && typeof setup.json === 'object' && !Array.isArray(setup.json)) {
      return {kind: 'api'}
    }
  } catch (error) {
    throw new DiscoveryError(classifyFetchError(error, base), await describeNetworkError(base, error))
  }

  throw new DiscoveryError('not-aoox', explainFailure('not-aoox', base))
}

/** Which failure is most worth showing when every candidate failed. */
const RANK: Record<Failure, number> = {
  'invalid-url': 0,
  'not-aoox': 3,
  'plain-http': 2,
  timeout: 1,
  tls: 4,
  unreachable: 0,
}

/**
 * Resolve what the user typed (a dashboard URL, normally) into the API URL.
 * Throws `DiscoveryError` with a ready-to-print message.
 */
export async function discover(input: string, fetchFn: FetchFn = fetch): Promise<Discovered> {
  const candidates = candidateUrls(input)
  const failures: DiscoveryError[] = []

  for (const base of candidates) {
    let result: ProbeOk
    try {
      // Sequential on purpose: https first, then http, then the :3000 guess.
      // eslint-disable-next-line no-await-in-loop
      result = await probe(fetchFn, base)
    } catch (error) {
      if (error instanceof DiscoveryError) {
        failures.push(error)
        continue
      }

      throw error
    }

    const notes: string[] = []
    if (result.kind === 'api') {
      notes.push(
        `Note: ${base} is the API address, not the dashboard. Next time use the address you open the dashboard with.`,
      )
      return {apiUrl: base, notes, webUrl: null}
    }

    let {apiUrl} = result.doc!
    const baseUrl = new URL(base)
    if (isLoopbackHost(new URL(apiUrl).hostname) && !isLoopbackHost(baseUrl.hostname)) {
      apiUrl = `http://${hostForUrl(baseUrl.hostname)}:${DEFAULT_API_PORT}`
      notes.push(
        `Note: the dashboard did not advertise a public API address, so ${apiUrl} is assumed. Set a panel domain in the dashboard (Infrastructure → Panel domain) to make this reliable.`,
      )
    }

    return {apiUrl, notes, version: result.doc!.version, webUrl: base}
  }

  // Report the most informative failure; its message names the address it tried.
  let best = failures[0]
  for (const f of failures) if (RANK[f.failure] > RANK[best.failure]) best = f
  throw best
}
