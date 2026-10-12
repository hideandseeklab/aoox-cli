import type {CliConfig} from './config.js'
import type {Registry} from './types.js'

import {api, ApiError} from './api.js'
import {readConfig} from './config.js'
import {registryHost} from './image-ref.js'
import {formatEndpoint, type PanelAddresses, resolvePanelAddresses, resolveRegistryIp} from './panel-addresses.js'
import {isLoopbackHost} from './registry-check.js'
import {chooseRegistry} from './registry-select.js'

/** What the registry lookup found, already reduced to what gets printed. */
export type RegistryLine =
  | {ip?: string; kind: 'found'; registry: Pick<Registry, 'type' | 'url'>}
  | {kind: 'error'; reason: string}
  | {kind: 'note'; text: string}

export interface ConnectionSummary {
  config: null | Pick<CliConfig, 'url' | 'webUrl'>
  /** IP and panel domain per endpoint, when they could be worked out (see `resolvePanelAddresses`). */
  panel?: PanelAddresses
  registry: null | RegistryLine
}

/** The block shown under the root `aoox` command list. Never contains the token. */
export function formatConnection(summary: ConnectionSummary): string[] {
  if (!summary.config) return ['Not connected — run: aoox login']

  // A login saved before the dashboard address was stored (or made with the API
  // address) may have no webUrl; showing the API address there would be wrong.
  const dashboard =
    (summary.panel && formatEndpoint(summary.panel.dashboard)) ??
    summary.config.webUrl ??
    'unknown (sign in again with the dashboard address: aoox login)'
  const api = (summary.panel && formatEndpoint(summary.panel.api)) ?? summary.config.url
  const lines = ['Connected to', `  Dashboard  ${dashboard}`, `  API        ${api}`]
  const {registry} = summary
  if (registry) {
    switch (registry.kind) {
      case 'error': {
        lines.push(`  Registry   (could not check: ${registry.reason})`)
        break
      }

      case 'found': {
        const host = registryHost(registry.registry.url)
        const loopback = isLoopbackHost(host)
        const address = registry.ip ? (loopback ? registry.ip : `${registry.ip} - ${host}`) : host
        const warning = loopback
          ? registry.ip
            ? ' (plain HTTP only — set a domain: aoox registry domain --set <host>)'
            : ' (only reachable on the server — set a domain: aoox registry domain --set <host>)'
          : ''
        lines.push(`  Registry   ${address} (${registry.registry.type})${warning}`)
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

/**
 * Stored config plus, in parallel, one ≤2 s `GET /registries` and the panel's IP/domain lookup
 * (`resolvePanelAddresses`, each request ≤1.5 s); never throws.
 */
export async function gatherConnection(configDir: string): Promise<ConnectionSummary> {
  let config: CliConfig | null
  try {
    config = await readConfig(configDir)
  } catch {
    return {config: null, registry: null}
  }

  if (!config) return {config: null, registry: null}

  const [registry, panel] = await Promise.all([
    registryLine(config),
    resolvePanelAddresses(config).catch(() => {}),
  ])
  if (registry.kind === 'found' && registry.registry.type === 'self-hosted' && panel?.serverIp) {
    const ip = await selfHostedRegistryIp(config, panel.serverIp)
    if (ip) registry.ip = ip
  }

  return {config, ...(panel ? {panel} : {}), registry}
}

/** Direct `http://<server IP>:<port>` of the self-hosted registry, when it answers; never throws. */
async function selfHostedRegistryIp(config: CliConfig, serverIp: string): Promise<null | string> {
  try {
    const status = await api<{publicUrl?: string}>(config, '/registries/self-hosted', {timeoutMs: 2000})
    return status.publicUrl ? await resolveRegistryIp(serverIp, status.publicUrl) : null
  } catch {
    return null
  }
}

async function registryLine(config: CliConfig): Promise<RegistryLine> {
  try {
    const registries = await api<Registry[]>(config, '/registries', {timeoutMs: 2000})
    const choice = chooseRegistry(registries)
    if (choice.kind === 'found') return {kind: 'found', registry: choice.registry}
    if (choice.kind === 'ambiguous') return {kind: 'note', text: '(several registries; pick one with --registry <id>)'}
    return {kind: 'note', text: '(none configured yet)'}
  } catch (error) {
    return {kind: 'error', reason: shortReason(error)}
  }
}
