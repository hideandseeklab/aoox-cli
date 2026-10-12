/**
 * Mirrors `slugPart()` in aoox-api's `deployment-runner.service.ts`
 * exactly (repo name = `<slug(project.name)>/<appName>`), so an image built
 * here lands at the same path the API's own build would have used.
 */
export function slugPart(s: string): string {
  return (
    s
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, '-')
      .replaceAll(/^-+|-+$/g, '')
      .slice(0, 40) || 'project'
  )
}

export function imageRefFor(options: {appName: string; projectName: string; registryUrl: string; tag: string}): string {
  const {appName, projectName, registryUrl, tag} = options
  return `${registryUrl}/${slugPart(projectName)}/${appName}:${tag}`
}

/** What the user typed for `aoox registry build|push`: `[host/]repo[:tag]`. */
export interface ParsedImageName {
  host: null | string
  repo: string
  tag: null | string
}

export class ImageNameError extends Error {
  readonly kind: 'invalid' | 'missing-version'

  constructor(kind: 'invalid' | 'missing-version', message: string) {
    super(message)
    this.kind = kind
    this.name = 'ImageNameError'
  }
}

// Same shapes the API accepts for imageRef (lowercase only) and the OCI
// distribution spec for repository path components / tags.
const REPO_COMPONENT = /^[a-z\d]+(?:(?:[._]|__|-+)[a-z\d]+)*$/
const TAG = /^\w[\w.-]{0,127}$/

/** First path segment is a registry host when it has a dot or port, or is `localhost`. */
function looksLikeHost(segment: string): boolean {
  return segment === 'localhost' || segment.includes('.') || segment.includes(':')
}

/** Parses and validates `[host/]repo[:tag]`; throws {@link ImageNameError}. */
export function parseImageName(input: string): ParsedImageName {
  const value = input.trim()
  if (!value) throw new ImageNameError('invalid', 'Image name is empty.')
  if (/[A-Z]/.test(value)) {
    throw new ImageNameError('invalid', `"${value}" must be lowercase (repository names and tags are lowercase).`)
  }

  if (value.includes('@')) {
    throw new ImageNameError('invalid', 'Digest references (@sha256:…) are not supported; use name:version.')
  }

  let rest = value
  let host: null | string = null
  const slash = rest.indexOf('/')
  if (slash > 0 && looksLikeHost(rest.slice(0, slash))) {
    host = rest.slice(0, slash)
    rest = rest.slice(slash + 1)
    if (!/^[\d.a-z-]+(?::\d+)?$/.test(host)) throw new ImageNameError('invalid', `Invalid registry host "${host}".`)
  }

  let tag: null | string = null
  const colon = rest.lastIndexOf(':')
  if (colon !== -1 && !rest.slice(colon).includes('/')) {
    tag = rest.slice(colon + 1)
    rest = rest.slice(0, colon)
    if (!tag) throw new ImageNameError('missing-version', `"${value}" has an empty version.`)
    if (!TAG.test(tag)) {
      throw new ImageNameError('invalid', `Invalid version "${tag}" (letters, digits, "_", ".", "-"; max 128 characters).`)
    }
  }

  if (!rest || !rest.split('/').every((part) => REPO_COMPONENT.test(part))) {
    throw new ImageNameError(
      'invalid',
      `Invalid image name "${rest}": use lowercase letters, digits and ".", "_", "-" (separated by "/" for a path).`,
    )
  }

  return {host, repo: rest, tag}
}

/** Registry host[:port] of a registry URL (scheme and trailing slashes removed). */
export function registryHost(url: string): string {
  return url.replace(/^https?:\/\//i, '').replace(/\/+$/, '')
}

/** Bumps the last number in a version (`1.0.9` → `1.0.10`); null when it does not start like a number. */
export function suggestNextVersion(version: string): null | string {
  if (!/^v?\d/.test(version)) return null
  const last = [...version.matchAll(/\d+/g)].at(-1)
  if (!last || last.index === undefined) return null
  const next = String(Number(last[0]) + 1).padStart(last[0].length, '0')
  return version.slice(0, last.index) + next + version.slice(last.index + last[0].length)
}
