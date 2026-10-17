/* eslint-disable n/no-unsupported-features/node-builtins -- every use is feature-detected at runtime (Node 22.15+/22.19+ and 23.10+/24.5+ only) */
import tls from 'node:tls'

/**
 * The slice of `node:tls` used here. `getCACertificates` exists since Node
 * 22.15 / 23.10 and `setDefaultCACertificates` since Node 22.19 / 24.5; on
 * older Node they are missing and nothing is changed.
 */
export interface CaApi {
  getCACertificates?: (type: 'default' | 'system') => string[]
  setDefaultCACertificates?: (certificates: string[]) => void
}

export type SystemCaResult = 'applied' | 'disabled' | 'failed' | 'unsupported'

/** `AOOX_SYSTEM_CA=0` (or `false`) keeps Node's bundled list only. */
export function systemCaDisabled(env: NodeJS.ProcessEnv): boolean {
  const value = env.AOOX_SYSTEM_CA?.trim().toLowerCase()
  return value === '0' || value === 'false'
}

/**
 * Trust the operating system's certificate store in addition to Node's bundled
 * Mozilla list (and `NODE_EXTRA_CA_CERTS`, which is part of the default list).
 * Antivirus HTTPS scanning and corporate proxies re-sign traffic with a root
 * that is installed in the OS store only. Verification stays on: this only
 * adds trusted roots, and never throws — any failure keeps today's behaviour.
 */
export function applySystemCa(env: NodeJS.ProcessEnv = process.env, api: CaApi = tls): SystemCaResult {
  if (systemCaDisabled(env)) return 'disabled'
  if (typeof api.getCACertificates !== 'function' || typeof api.setDefaultCACertificates !== 'function') {
    return 'unsupported'
  }

  try {
    const merged = [...new Set([...api.getCACertificates('default'), ...api.getCACertificates('system')])]
    api.setDefaultCACertificates(merged)
    return 'applied'
  } catch {
    return 'failed'
  }
}
