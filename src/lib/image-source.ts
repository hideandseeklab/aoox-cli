import {execFileSync} from 'node:child_process'
import {readdirSync, readFileSync} from 'node:fs'
import path from 'node:path'

import {ImageNameError, parseImageName} from './image-ref.js'
import {
  type ManifestInfo,
  parseCargoToml,
  parseComposerJson,
  parseCsproj,
  parsePackageJson,
  parsePom,
  parsePubspec,
  parsePyproject,
} from './manifest-parsers.js'

/** Raised with a message and hint lines; the command prints them with `fail()`. */
export class ImageSourceError extends Error {
  readonly lines: string[]

  constructor(...lines: string[]) {
    super(lines[0])
    this.lines = lines
    this.name = 'ImageSourceError'
  }
}

/** Everything the resolver reads from the outside, so tests can fake it. */
export interface SourceEnv {
  /** Folder name of the directory (basename of its absolute path). */
  dirName: string
  /** File names in the directory (not recursive). */
  files: string[]
  git: {
    /** `git describe --tags`: nearest tag plus distance; null when no tags / no repo. */
    describe(): null | string
    /** `git describe --tags --exact-match`; null when HEAD is not on a tag / no repo. */
    exactTag(): null | string
  }
  read(file: string): null | string
}

export interface ResolvedSource {
  /** Extra lines to show under the source note. */
  notes: string[]
  /** Where each part came from (e.g. `package.json`, `folder`, `git tag v1.4.2`); null = typed. */
  origin: {name: null | string; version: null | string}
  /** `[host/]name:version`, ready for `parseImageName`. */
  raw: string
}

/** Manifest files in lookup order. */
export const MANIFEST_FILES = ['package.json', 'pyproject.toml', 'Cargo.toml', 'composer.json', 'pubspec.yaml', '*.csproj', 'pom.xml']

/** Human list used in the "nothing found" hint. */
export const SOURCE_LIST = `${MANIFEST_FILES.join(', ')}, a VERSION file, or a git tag`

// Same rule as TAG in image-ref.ts, applied after the "+" replacement.
const TAG = /^\w[\w.-]{0,127}$/

/** `@acme/web` → `web`, `vendor/pkg` → `pkg`; lowercased (image names cannot have uppercase). */
export function imageNameFromManifest(name: string): string {
  const trimmed = name.trim()
  return trimmed.slice(trimmed.lastIndexOf('/') + 1).toLowerCase()
}

/** Folder name made into an image name: lowercase, odd characters → "-", ends trimmed. */
export function imageNameFromFolder(folder: string): string {
  return folder
    .toLowerCase()
    .replaceAll(/[^a-z\d._-]+/g, '-')
    .replaceAll(/-{2,}/g, '-')
    .replaceAll(/^[^a-z\d]+|[^a-z\d]+$/g, '')
}

/** `1.2.3+build.5` → `1.2.3_build.5` ("+" is not allowed in a tag; "_" is the Helm convention). */
export function tagFromVersion(version: string): {changed: boolean; tag: string} {
  const trimmed = version.trim()
  const tag = trimmed.replaceAll('+', '_')
  return {changed: tag !== trimmed, tag}
}

const isTag = (tag: string): boolean => TAG.test(tag)

/** A bare image name (no host, path or version) that passes the normal name rules. */
function validName(name: string): boolean {
  if (!name || name.includes('/') || name.includes(':')) return false
  try {
    parseImageName(name)
    return true
  } catch (error) {
    if (error instanceof ImageNameError) return false
    throw error
  }
}

interface Manifest extends ManifestInfo {
  file: string
}

function readManifests(env: SourceEnv): {manifests: Manifest[]; notes: string[]} {
  const manifests: Manifest[] = []
  const notes: string[] = []
  const add = (file: string, info: ManifestInfo) => {
    manifests.push({...info, file})
    if (info.note) notes.push(info.note)
  }

  const simple: Array<[string, (c: string) => ManifestInfo]> = [
    ['package.json', parsePackageJson],
    ['pyproject.toml', parsePyproject],
    ['Cargo.toml', parseCargoToml],
    ['composer.json', parseComposerJson],
    ['pubspec.yaml', parsePubspec],
  ]
  for (const [file, parse] of simple) {
    const content = env.files.includes(file) ? env.read(file) : null
    if (content !== null) add(file, parse(content))
  }

  const csproj = env.files.filter((f) => f.toLowerCase().endsWith('.csproj'))
  if (csproj.length === 1) {
    const content = env.read(csproj[0])
    if (content !== null) add(csproj[0], parseCsproj(content, csproj[0]))
  } else if (csproj.length > 1) {
    notes.push(`${csproj.length} .csproj files found (${csproj.join(', ')}); skipped, cannot tell which to use`)
  }

  const pom = env.files.includes('pom.xml') ? env.read('pom.xml') : null
  if (pom !== null) add('pom.xml', parsePom(pom))
  return {manifests, notes}
}

function versionTag(raw: string, file: string, notes: string[]): string {
  const {changed, tag} = tagFromVersion(raw)
  if (!isTag(tag)) {
    throw new ImageSourceError(
      `The version "${raw}" in ${file} is not a valid image tag (letters, digits, "_", ".", "-"; max 128 characters).`,
      'Pass the version explicitly: name:version.',
    )
  }

  if (changed) notes.push(`"+" in the version was replaced by "_" (tags cannot contain "+"): ${raw} → ${tag}`)
  return tag
}

/** git tag → docker tag: leading `v` dropped, odd characters → "-". */
function tagFromGit(tag: string): string {
  return tag
    .replace(/^v(?=\d)/, '')
    .replaceAll(/[^\w.-]+/g, '-')
    .replace(/^[.-]+/, '')
}

function typedResult(raw: string): ResolvedSource {
  return {notes: [], origin: {name: null, version: null}, raw}
}

function fromGit(env: SourceEnv, force: boolean, notes: string[]): null | {origin: string; tag: string} {
  const exact = env.git.exactTag()
  if (exact) {
    const tag = tagFromGit(exact)
    if (!isTag(tag)) {
      throw new ImageSourceError(`The git tag "${exact}" is not a valid image tag.`, 'Pass the version explicitly: name:version.')
    }

    return {origin: `git tag ${exact}`, tag}
  }

  const described = env.git.describe()
  if (!described) return null
  const candidate = tagFromGit(described)
  if (!force || !isTag(candidate)) {
    throw new ImageSourceError(
      `HEAD is not on a git tag (nearest: ${described}), so no version can be taken from git.`,
      `Tag the release (git tag v1.0.0), pass name:version, or add --force to use "${candidate}".`,
    )
  }

  notes.push('HEAD is not exactly on a tag; the version is the nearest tag plus the commits since it and the commit id.')
  return {origin: `git describe ${described}`, tag: candidate}
}

/**
 * Completes what the user typed from the project: `name:version` is used as
 * typed (nothing is read); a name without version needs a version; nothing
 * typed needs both. Sources, in order: manifests (first one that has the value),
 * a VERSION file, a git tag (version only), the folder name (name only).
 * Throws {@link ImageSourceError}.
 */
// eslint-disable-next-line complexity -- one linear lookup chain, one branch per source
export function resolveImageSource(typed: string | undefined, env: SourceEnv, options: {force?: boolean} = {}): ResolvedSource {
  const value = typed?.trim()
  if (value) {
    try {
      if (parseImageName(value).tag) return typedResult(value)
    } catch (error) {
      // Invalid typed input is reported by the caller's own parse, as before.
      if (error instanceof ImageNameError) return typedResult(value)
      throw error
    }
  }

  const {manifests, notes: skipNotes} = readManifests(env)
  const notes: string[] = []
  if (manifests.length > 1) {
    notes.push(`Found ${manifests.map((m) => m.file).join(', ')}; the first one that has a value is used.`)
  }

  let name = value
  let nameOrigin: null | string = null
  const withName = value ? undefined : manifests.find((m) => m.name)
  if (withName?.name) {
    name = imageNameFromManifest(withName.name)
    if (!validName(name)) {
      throw new ImageSourceError(
        `The name "${withName.name}" in ${withName.file} is not a valid image name.`,
        'Pass the name explicitly: name:version.',
      )
    }

    nameOrigin = withName.file
  }

  let tag: string | undefined
  let versionOrigin: null | string = null
  const withVersion = manifests.find((m) => m.version)
  if (withVersion?.version) {
    tag = versionTag(withVersion.version, withVersion.file, notes)
    versionOrigin = withVersion.file
  }

  if (!tag && env.files.includes('VERSION')) {
    const line = env
      .read('VERSION')
      ?.split(/\r?\n/)
      .map((l) => l.trim())
      .find(Boolean)
    if (line) {
      tag = versionTag(line, 'VERSION', notes)
      versionOrigin = 'VERSION'
    }
  }

  if (!tag) {
    const git = fromGit(env, options.force ?? false, notes)
    if (git) {
      tag = git.tag
      versionOrigin = git.origin
    }
  }

  if (!name) {
    const folder = imageNameFromFolder(env.dirName)
    if (validName(folder)) {
      name = folder
      nameOrigin = 'folder'
    }
  }

  if (!name || !tag) {
    const first = value
      ? `A version is required: "${value}" has none.`
      : name
        ? `A version is required for "${name}".`
        : 'An image name and version are required (name:version).'
    throw new ImageSourceError(
      first,
      `Pass name:version, or put them in one of: ${SOURCE_LIST}.`,
      ...skipNotes.map((n) => `Note: ${n}.`),
    )
  }

  return {notes, origin: {name: nameOrigin, version: versionOrigin}, raw: `${name}:${tag}`}
}

/** "name and version from package.json" / "name from folder, version from git tag v1.4.2". */
export function describeOrigin(origin: ResolvedSource['origin']): string {
  const {name, version} = origin
  if (name && version && name === version) return `name and version from ${name}`
  return [name && `name from ${name}`, version && `version from ${version}`].filter(Boolean).join(', ')
}

/** What to do to get a new version, given where the current one came from. */
export function bumpHint(versionOrigin: null | string, example: null | string, fullExample: null | string): string {
  const eg = example ? ` (e.g. ${example})` : ''
  const pass = fullExample ? `pass name:version (e.g. ${fullExample})` : 'pass name:version'
  if (!versionOrigin) return `Pick a new version${eg}`
  if (versionOrigin.startsWith('git')) return `Tag a new release, ${pass}`
  if (versionOrigin === 'VERSION') return `Bump the VERSION file${eg}, ${pass}`
  return `Bump the version in ${versionOrigin}${eg}, ${pass}`
}

/** Reads one directory (relative to cwd); git is called lazily and only when needed. */
export function directoryEnv(dir: string): SourceEnv {
  const abs = path.resolve(dir)
  let files: string[] = []
  try {
    files = readdirSync(abs, {withFileTypes: true})
      .filter((e) => e.isFile())
      .map((e) => e.name)
  } catch {
    // Missing directory: nothing to read.
  }

  const git = (args: string[]): null | string => {
    try {
      return (
        execFileSync('git', args, {cwd: abs, stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000}).toString().trim() || null
      )
    } catch {
      return null
    }
  }

  return {
    dirName: path.basename(abs),
    files,
    git: {
      describe: () => git(['describe', '--tags']),
      exactTag: () => git(['describe', '--tags', '--exact-match']),
    },
    read(file) {
      try {
        return readFileSync(path.join(abs, file), 'utf8')
      } catch {
        return null
      }
    },
  }
}
