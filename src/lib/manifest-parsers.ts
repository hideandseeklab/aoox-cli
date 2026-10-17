/**
 * Pure readers for the project manifests `aoox registry build|push` can take an
 * image name and version from. Each reads the text of one file and returns what
 * it finds; anything it cannot read with certainty (a variable, a workspace
 * reference, a dynamic version) is reported as missing, never guessed.
 * No TOML/YAML/XML library: only a few simple top-level values are needed.
 */

export interface ManifestInfo {
  name?: string
  /** Why the file was skipped or partly ignored (shown only when nothing else works). */
  note?: string
  version?: string
}

const text = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined)

function jsonInfo(content: string, file: string): ManifestInfo {
  let json: unknown
  try {
    json = JSON.parse(content)
  } catch {
    return {note: `${file} is not valid JSON`}
  }

  if (!json || typeof json !== 'object' || Array.isArray(json)) return {note: `${file} is not a JSON object`}
  const {name, version} = json as Record<string, unknown>
  return {name: text(name), version: text(version)}
}

export const parsePackageJson = (content: string): ManifestInfo => jsonInfo(content, 'package.json')
export const parseComposerJson = (content: string): ManifestInfo => jsonInfo(content, 'composer.json')

/** Quoted TOML string value at the start of `raw`, or undefined for anything else. */
function tomlString(raw: string): string | undefined {
  const value = raw.trim()
  if (value.startsWith('"""') || value.startsWith("'''")) return undefined
  const basic = /^"((?:[^"\\]|\\.)*)"/.exec(value)
  if (basic) return basic[1].replaceAll(/\\(["\\])/g, '$1')
  return /^'([^']*)'/.exec(value)?.[1]
}

/** `{section: {key: rawValue}}` for simple `key = value` lines. */
function tomlSections(content: string): Map<string, Map<string, string>> {
  const sections = new Map<string, Map<string, string>>()
  let current = new Map<string, string>()
  sections.set('', current)
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    if (line.startsWith('[[')) {
      current = new Map<string, string>() // array of tables: not a place we read from
      continue
    }

    const header = /^\[([^[\]]+)]\s*(?:#.*)?$/.exec(line)
    if (header) {
      const name = header[1].replaceAll(/\s+/g, '')
      current = sections.get(name) ?? new Map<string, string>()
      sections.set(name, current)
      continue
    }

    const kv = /^([\w.-]+)\s*=\s*(.*)$/.exec(line)
    if (kv && !current.has(kv[1])) current.set(kv[1], kv[2])
  }

  return sections
}

export function parsePyproject(content: string): ManifestInfo {
  const sections = tomlSections(content)
  const project = sections.get('project')
  const poetry = sections.get('tool.poetry')
  const dynamicVersion = /["']version["']/.test(project?.get('dynamic') ?? '')
  const pick = (key: string): string | undefined => {
    const fromProject = project?.has(key) ? tomlString(project.get(key) ?? '') : undefined
    if (fromProject) return fromProject
    if (key === 'version' && dynamicVersion) return undefined
    return poetry?.has(key) ? tomlString(poetry.get(key) ?? '') : undefined
  }

  return {name: pick('name'), version: pick('version')}
}

/** `version.workspace = true` and `version = {workspace = true}` are not strings, so the version stays missing. */
export function parseCargoToml(content: string): ManifestInfo {
  const pkg = tomlSections(content).get('package')
  return {name: tomlString(pkg?.get('name') ?? ''), version: tomlString(pkg?.get('version') ?? '')}
}

/** Top-level (unindented) `name:` / `version:` of a pubspec.yaml. */
export function parsePubspec(content: string): ManifestInfo {
  const out: ManifestInfo = {}
  for (const line of content.split(/\r?\n/)) {
    const m = /^(name|version):\s*(.*)$/.exec(line)
    if (!m) continue
    const rest = m[2].trim()
    const quoted = /^"([^"]*)"/.exec(rest) ?? /^'([^']*)'/.exec(rest)
    const value = (quoted ? quoted[1] : rest.replace(/\s+#.*$/, '')).trim()
    const key = m[1] as 'name' | 'version'
    if (value && !(key in out)) out[key] = value
  }

  return out
}

const stripXmlComments = (xml: string): string => xml.replaceAll(/<!--[\s\S]*?-->/g, '').replaceAll(/<\?[\s\S]*?\?>/g, '')

function decodeXml(value: string): string {
  return value.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&apos;', "'").replaceAll('&amp;', '&')
}

const hasVariable = (v: string): boolean => v.includes('$(') || v.includes('${')
const clean = (v?: string): string | undefined => (v && !hasVariable(v) ? v : undefined)

/** First `<Tag>value</Tag>` anywhere (MSBuild property groups); values with `$(…)` count as missing. */
function msbuildProperty(xml: string, tag: string): string | undefined {
  const m = new RegExp(String.raw`<${tag}(?:\s[^>]*)?>([^<]*)</${tag}>`).exec(xml)
  const value = m ? decodeXml(m[1]).trim() : ''
  return value && !hasVariable(value) ? value : undefined
}

export function parseCsproj(content: string, fileName: string): ManifestInfo {
  const xml = stripXmlComments(content)
  const prefix = msbuildProperty(xml, 'VersionPrefix')
  const suffix = msbuildProperty(xml, 'VersionSuffix')
  const version = msbuildProperty(xml, 'Version') ?? (prefix ? (suffix ? `${prefix}-${suffix}` : prefix) : undefined)
  const name = msbuildProperty(xml, 'AssemblyName') ?? (fileName.replace(/\.csproj$/i, '') || undefined)
  return {name, version}
}

/** Direct children `artifactId` / `version` of the root `<project>` (not `<parent>`, not dependencies). */
export function parsePom(content: string): ManifestInfo {
  const xml = stripXmlComments(content).replaceAll(/<!\[CDATA\[([\s\S]*?)]]>/g, (_, c: string) => c.replaceAll('<', '&lt;'))
  const found: Record<string, string> = {}
  const stack: string[] = []
  let start = 0
  let hasChildren = false
  const tag = /<(\/?)([A-Za-z][\w.:-]*)([^>]*?)(\/?)>/g
  let m: null | RegExpExecArray
  while ((m = tag.exec(xml))) {
    const [whole, closing, name, , selfClosing] = m
    if (selfClosing) {
      if (stack.length === 2) hasChildren = true
      continue
    }

    if (closing) {
      const direct = stack.length === 2 && stack[0] === 'project' && stack[1] === name
      if (direct && !hasChildren && (name === 'artifactId' || name === 'version')) {
        const value = decodeXml(xml.slice(start, m.index)).trim()
        if (value && !(name in found)) found[name] = value
      }

      stack.pop()
      continue
    }

    if (stack.length === 1) {
      start = m.index + whole.length
      hasChildren = false
    } else if (stack.length === 2) {
      hasChildren = true
    }

    stack.push(name)
  }

  return {name: clean(found.artifactId), version: clean(found.version)}
}
