import {execFileSync} from 'node:child_process'

/**
 * What both Docker's tag syntax and the API's `imageRef` DTO accept:
 * lowercase only (the DTO's regex allows no uppercase anywhere in the
 * reference), `[a-z0-9._-]`, never starting with `.`/`-`.
 */
export function sanitizeTag(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replaceAll(/[^a-z0-9._-]/g, '-')
    .replace(/^[.-]+/, '')
  return cleaned.slice(0, 128) || 'build'
}

/**
 * A short, stable tag for the image about to be built: the git short SHA,
 * `-dirty` appended when the working tree has uncommitted changes (so a
 * rebuild after an edit never silently reuses yesterday's tag), or an ISO
 * timestamp when `cwd` is not a git repo at all.
 */
export function deployTag(cwd: string): string {
  try {
    const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {cwd, stdio: ['ignore', 'pipe', 'ignore']})
      .toString()
      .trim()
    const dirty = execFileSync('git', ['status', '--porcelain'], {cwd, stdio: ['ignore', 'pipe', 'ignore']})
      .toString()
      .trim()
    return sanitizeTag(dirty ? `${sha}-dirty` : sha)
  } catch {
    // Not a git repo (or git is not installed) — a build still needs a tag.
    return sanitizeTag(new Date().toISOString())
  }
}
