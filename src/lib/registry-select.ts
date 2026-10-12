import type {Registry} from './types.js'

import {registryHost} from './image-ref.js'
import {isLoopbackHost} from './registry-check.js'

export type RegistryChoice =
  | {kind: 'ambiguous'; registries: Registry[]}
  | {kind: 'error'; message: string; suggestions?: string[]}
  | {kind: 'found'; registry: Registry}

/**
 * Which registry `aoox deploy` / `aoox registry build|push` use: an explicit
 * id, else (push) the one whose host matches a full image name, else the
 * self-hosted registry, else the only one; several external ones are
 * ambiguous (the caller prompts or asks for --registry).
 */
export function chooseRegistry(registries: Registry[], registryId?: string, host?: null | string): RegistryChoice {
  if (registryId) {
    const found = registries.find((r) => r.id === registryId)
    return found ? {kind: 'found', registry: found} : {kind: 'error', message: `Registry ${registryId} not found.`}
  }

  if (registries.length === 0) {
    return {
      kind: 'error',
      message: 'No registry in the panel yet.',
      suggestions: ['Provision a local registry under Infrastructure, or add an external registry.'],
    }
  }

  if (host) {
    const byHost = registries.find((r) => registryHost(r.url) === host)
    if (byHost) return {kind: 'found', registry: byHost}
  }

  const selfHosted = registries.find((r) => r.type === 'self-hosted')
  if (selfHosted) return {kind: 'found', registry: selfHosted}
  if (registries.length === 1) return {kind: 'found', registry: registries[0]}
  return {kind: 'ambiguous', registries}
}

/** Warning when the registry address only works on the server itself; null otherwise. */
export function localhostRegistryHint(registryUrl: string, panelUrl: string): null | string {
  const host = registryHost(registryUrl)
  if (!isLoopbackHost(host)) return null
  let panelHost: string
  try {
    panelHost = new URL(panelUrl).hostname
  } catch {
    return null
  }

  if (isLoopbackHost(panelHost)) return null
  return `The registry address (${host}) is only reachable on the server itself, but the panel is at ${panelHost}. Set a public address: aoox registry domain --set <host>`
}
