import type {CliConfig} from './config.js'
import type {Registry} from './types.js'

import {api, ApiError} from './api.js'
import {readConfig} from './config.js'
import {registryHost} from './image-ref.js'
import {isLoopbackHost} from './registry-check.js'
import {chooseRegistry} from './registry-select.js'

/** What the registry lookup found, already reduced to what gets printed. */
export type RegistryLine =
  | {kind: 'error'; reason: string}
  | {kind: 'found'; registry: Pick<Registry, 'type' | 'url'>}
  | {kind: 'note'; text: string}

export interface ConnectionSummary {
  config: null | Pick<CliConfig, 'url' | 'webUrl'>
  registry: null | RegistryLine
}

/** The block shown under the root `aoox` command list. Never contains the token. */
export function formatConnection(summary: ConnectionSummary): string[] {
  if (!summary.config) return ['Not connected — run: aoox login']

  const lines = ['Connected to', `  Dashboard  ${summary.config.webUrl ?? summary.config.url}`, `  API        ${summary.config.url}`]
  const {registry} = summary
  if (registry) {
    switch (registry.kind) {
      case 'error': {
        lines.push(`  Registry   (could not check: ${registry.reason})`)
        break
      }

      case 'found': {
        const host = registryHost(registry.registry.url)
        const warning = isLoopbackHost(host)
          ? ' (only reachable on the server — set a domain: aoox registry domain --set <host>)'
          : ''
        lines.push(`  Registry   ${host} (${registry.registry.type})${warning}`)
        break
      }

      case 'note': {
        lines.push(`  Registry   ${registry.text}`)
        break
      }
    }
  }

  return lines
}

/** Short, token-free reason for a failed lookup. */
export function shortReason(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'token no longer valid'
    if (error.status === 0) return 'panel unreachable'
    return `HTTP ${error.status}`
  }

  const message = error instanceof Error ? error.message : String(error)
  return message.length > 60 ? `${message.slice(0, 57)}...` : message
}

/** Stored config (no network) plus one ≤2 s `GET /registries`; never throws. */
export async function gatherConnection(configDir: string): Promise<ConnectionSummary> {
  let config: CliConfig | null
  try {
    config = await readConfig(configDir)
  } catch {
    return {config: null, registry: null}
  }

  if (!config) return {config: null, registry: null}

  try {
    const registries = await api<Registry[]>(config, '/registries', {timeoutMs: 2000})
    const choice = chooseRegistry(registries)
    if (choice.kind === 'found') return {config, registry: {kind: 'found', registry: choice.registry}}
    if (choice.kind === 'ambiguous') {
      return {config, registry: {kind: 'note', text: '(several registries; pick one with --registry <id>)'}}
    }

    return {config, registry: {kind: 'note', text: '(none configured yet)'}}
  } catch (error) {
    return {config, registry: {kind: 'error', reason: shortReason(error)}}
  }
}
