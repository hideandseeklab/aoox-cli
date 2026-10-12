/**
 * Semver 2.0.0 precedence for the versions aoox ships (`0.1.0-alpha.10`).
 * Returns <0, 0, >0 like a sort comparator; null when either side is not semver.
 */
export function compareVersions(a: string, b: string): null | number {
  const pa = parse(a)
  const pb = parse(b)
  if (!pa || !pb) return null

  for (let i = 0; i < 3; i++) {
    if (pa.core[i] !== pb.core[i]) return pa.core[i] < pb.core[i] ? -1 : 1
  }

  // A release outranks any pre-release of the same core.
  if (pa.pre.length === 0 && pb.pre.length === 0) return 0
  if (pa.pre.length === 0) return 1
  if (pb.pre.length === 0) return -1

  const length = Math.max(pa.pre.length, pb.pre.length)
  for (let i = 0; i < length; i++) {
    const x = pa.pre[i]
    const y = pb.pre[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    if (x === y) continue
    const xn = /^\d+$/.test(x)
    const yn = /^\d+$/.test(y)
    if (xn && yn) return Number(x) < Number(y) ? -1 : 1
    if (xn) return -1
    if (yn) return 1
    return x < y ? -1 : 1
  }

  return 0
}

function parse(version: string): null | {core: number[]; pre: string[]} {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([\w.-]+))?(?:\+[\w.-]+)?$/.exec(version.trim())
  if (!m) return null
  return {core: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] ? m[4].split('.') : []}
}

/** The one-line warning when the CLI is older than the panel; null otherwise. */
export function outdatedCliWarning(cliVersion: string, panelVersion: string | undefined): null | string {
  if (!panelVersion) return null
  const cmp = compareVersions(cliVersion, panelVersion)
  if (cmp === null || cmp >= 0) return null
  return `Your aoox CLI (${cliVersion}) is older than the panel (${panelVersion}). Update it: aoox update`
}
