import {compareVersions} from './version.js'

export const PACKAGE_NAME = '@hideandseeklab/aoox'

/** Registry base; `AOOX_NPM_REGISTRY` points tests/mirrors elsewhere. */
export function packumentUrl(base = process.env.AOOX_NPM_REGISTRY ?? 'https://registry.npmjs.org'): string {
  return `${base.replace(/\/+$/, '')}/${PACKAGE_NAME.replace('/', '%2f')}`
}

/** The slice of the npm "abbreviated packument" we use. */
export interface Packument {
  'dist-tags'?: Record<string, string>
  versions?: Record<string, undefined | {deprecated?: string}>
}

const isPreRelease = (version: string): boolean => version.includes('-')

/** `0.1.0-alpha.7` → `alpha`; null for a stable version. */
export function channelOf(version: string): null | string {
  return /^v?\d+\.\d+\.\d+-([A-Za-z]+)/.exec(version)?.[1]?.toLowerCase() ?? null
}

/**
 * Newest version to move to, or null when the installed one is already the
 * newest. A pre-release install follows the newest of `latest` and its own
 * channel tag (`alpha`); a stable install only ever sees stable versions.
 * Versions missing from `versions` or marked deprecated are skipped.
 */
export function pickNewest(doc: Packument, installed: string): null | string {
  const tags = doc['dist-tags'] ?? {}
  const candidates = new Set<string>()
  if (tags.latest) candidates.add(tags.latest)
  const channel = channelOf(installed)
  if (channel && tags[channel]) candidates.add(tags[channel])

  const usable = [...candidates].filter((version) => {
    if (!isPreRelease(installed) && isPreRelease(version)) return false
    if (doc.versions) {
      const meta = doc.versions[version]
      if (!meta || meta.deprecated) return false
    }

    return compareVersions(version, version) !== null
  })

  let best: null | string = null
  for (const version of usable) {
    if (best === null || (compareVersions(version, best) ?? 0) > 0) best = version
  }

  if (best === null) return null
  const cmp = compareVersions(best, installed)
  return cmp !== null && cmp > 0 ? best : null
}

export async function fetchPackument(fetchFn: typeof fetch = fetch, url = packumentUrl()): Promise<Packument> {
  let response: Response
  try {
    response = await fetchFn(url, {
      headers: {accept: 'application/vnd.npm.install-v1+json'},
      signal: AbortSignal.timeout(10_000),
    })
  } catch (error) {
    const cause = (error as {cause?: {message?: string}}).cause?.message ?? (error as Error).message
    throw new Error(`Could not reach the npm registry (${cause}). Check your internet connection and try again.`)
  }

  if (!response.ok) throw new Error(`The npm registry answered ${response.status} ${response.statusText}.`)
  return (await response.json()) as Packument
}

export type InstallMethod = 'npm-global' | 'other' | 'standalone'

export interface InstallProbe {
  /** `bin/node` (or `node.exe`) exists inside the CLI root: an `oclif pack tarballs` install. */
  hasBundledNode: boolean
  root: string
}

/** How this copy of the CLI was installed; decides what `aoox update` may do. */
export function detectInstallMethod(probe: InstallProbe): InstallMethod {
  const root = probe.root.replaceAll('\\', '/').replace(/\/+$/, '')
  if (probe.hasBundledNode) return 'standalone'

  const m = /^(.*)\/node_modules\/@hideandseeklab\/aoox$/.exec(root)
  if (!m) return 'other'
  const parent = m[1]
  // npx cache and nested/local project dependencies are not a global install.
  if (parent.includes('/node_modules') || parent.includes('/_npx')) return 'other'
  // Unix: <prefix>/lib/node_modules. Windows: <prefix>/node_modules (e.g. %APPDATA%/npm).
  if (parent.endsWith('/lib') || /^[A-Za-z]:\//.test(parent)) return 'npm-global'
  return 'other'
}

export function npmInstallArgs(version: string): string[] {
  return ['i', '-g', `${PACKAGE_NAME}@${version}`]
}

export function installInstructions(method: InstallMethod, version: string): string[] {
  const npm = `npm i -g ${PACKAGE_NAME}@${version}`
  if (method === 'standalone') {
    return [
      'This copy was installed from the standalone tarball. Re-run the installer to upgrade it:',
      `  curl -fsSL https://aoox.dev/install-cli.sh | AOOX_VERSION=${version} sh`,
    ]
  }

  return [
    'Could not tell how this CLI was installed (source checkout, npx or a local dependency), so nothing was changed. To update:',
    `  ${npm}`,
  ]
}
