import type {Registry} from './types.js'

import {registryHost} from './image-ref.js'

export type FetchLike = typeof fetch

const MANIFEST_ACCEPT = [
  'application/vnd.docker.distribution.manifest.v2+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.oci.image.index.v1+json',
].join(', ')

export class RegistryCheckError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RegistryCheckError'
  }
}

export interface BearerChallenge {
  realm: string
  scope?: string
  service?: string
}

/** `Bearer realm="…",service="…",scope="…"` → fields; null for Basic or garbage. */
export function parseBearerChallenge(header: null | string): BearerChallenge | null {
  if (!header || !/^bearer\s/i.test(header)) return null
  const fields: Record<string, string> = {}
  for (const m of header.slice(7).matchAll(/(\w+)="([^"]*)"/g)) fields[m[1].toLowerCase()] = m[2]
  if (!fields.realm) return null
  return {realm: fields.realm, scope: fields.scope, service: fields.service}
}

export const isLoopbackHost = (host: string): boolean => /^(localhost|127\.|\[?::1)/.test(host)

/**
 * Where to talk to the registry's HTTP API, in order. Mirrors the API: an
 * explicit scheme wins; the self-hosted registry is plain HTTP unless it has
 * a domain; external ones are https. Loopback / bare-IP hosts also try the
 * other scheme (a local test registry is usually plain HTTP).
 */
export function registryBaseUrls(registry: Pick<Registry, 'domain' | 'type' | 'url'>): string[] {
  const scheme = /^(https?):\/\//i.exec(registry.url)?.[1]?.toLowerCase()
  const host = registryHost(registry.url)
  if (scheme) return [`${scheme}://${host}`]
  if (isLoopbackHost(host) || /^\d+\.\d+\.\d+\.\d+(:\d+)?$/.test(host)) return [`http://${host}`, `https://${host}`]
  if (registry.type === 'self-hosted' && !registry.domain) return [`http://${host}`]
  return [`https://${host}`]
}

export interface ManifestCheck {
  baseUrl: string
  fetchFn?: FetchLike
  password?: null | string
  repo: string
  tag: string
  username?: null | string
}

/**
 * `HEAD /v2/<repo>/manifests/<tag>`: true = exists, false = 404. Handles
 * Basic auth and the bearer-token flow (401 + `WWW-Authenticate: Bearer`).
 */
export async function manifestExists(options: ManifestCheck): Promise<boolean> {
  const {baseUrl, fetchFn = fetch, password, repo, tag, username} = options
  const url = `${baseUrl}/v2/${repo}/manifests/${tag}`
  const basic = username && password ? `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}` : undefined

  const head = (authorization?: string) =>
    fetchFn(url, {
      headers: {accept: MANIFEST_ACCEPT, ...(authorization ? {authorization} : {})},
      method: 'HEAD',
      signal: AbortSignal.timeout(15_000),
    })

  let response = await head(basic)

  if (response.status === 401) {
    const challenge = parseBearerChallenge(response.headers.get('www-authenticate'))
    if (!challenge) throw new RegistryCheckError('the registry rejected the credentials (401)')

    const tokenUrl = new URL(challenge.realm)
    if (challenge.service) tokenUrl.searchParams.set('service', challenge.service)
    tokenUrl.searchParams.set('scope', challenge.scope ?? `repository:${repo}:pull`)
    const tokenResponse = await fetchFn(tokenUrl, {
      headers: basic ? {authorization: basic} : {},
      signal: AbortSignal.timeout(15_000),
    })
    if (!tokenResponse.ok) throw new RegistryCheckError(`the registry token service answered ${tokenResponse.status}`)
    const body = (await tokenResponse.json()) as {access_token?: string; token?: string}
    const token = body.token ?? body.access_token
    if (!token) throw new RegistryCheckError('the registry token service returned no token')

    response = await head(`Bearer ${token}`)
    if (response.status === 401) throw new RegistryCheckError('the registry rejected the credentials (401)')
  }

  if (response.status === 200) return true
  if (response.status === 404) return false
  throw new RegistryCheckError(`unexpected answer ${response.status} from the registry`)
}

/** Tries each base URL until one is reachable (only transport errors fall through). */
export async function manifestExistsAnywhere(
  baseUrls: string[],
  options: Omit<ManifestCheck, 'baseUrl'>,
): Promise<boolean> {
  let lastError: unknown
  for (const baseUrl of baseUrls) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await manifestExists({...options, baseUrl})
    } catch (error) {
      if (error instanceof RegistryCheckError) throw error
      lastError = error
    }
  }

  const err = lastError as (Error & {cause?: Error}) | undefined
  const reason = err?.cause?.message ?? err?.message ?? 'unknown error'
  throw new RegistryCheckError(`could not reach the registry at ${baseUrls[0]} (${reason})`)
}
