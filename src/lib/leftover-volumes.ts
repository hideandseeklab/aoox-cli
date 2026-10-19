import {readdir, stat} from 'node:fs/promises'

/**
 * Named volumes the panel stack keeps its data in. If one of them is still on
 * the machine when `aoox install` starts from an empty folder, the new random
 * POSTGRES_PASSWORD cannot open the old data, so the installer must notice
 * before it writes anything.
 */

/** Compose project name (`name:` at the top level of the compose file), `aoox` by default. */
export function composeProjectName(compose: string): string {
  const m = /^name:\s*["']?([A-Za-z0-9_.-]+)["']?\s*(?:#.*)?$/m.exec(compose)
  return m?.[1] ?? 'aoox'
}

/**
 * Docker names of the volumes the compose file declares at the top level:
 * `<project>_<key>` unless the entry sets its own `name:`; `external: true`
 * volumes belong to someone else and are skipped.
 */
export function declaredVolumeNames(compose: string): string[] {
  const project = composeProjectName(compose)
  const lines = compose.split(/\r?\n/)
  const start = lines.findIndex((l) => /^volumes:\s*(?:#.*)?$/.test(l))
  if (start === -1) return []

  const entries: Array<{body: string[]; key: string}> = []
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break // next top-level key
    const key = /^ {2}([A-Za-z0-9_.-]+):/.exec(line)
    if (key) entries.push({body: [], key: key[1]})
    else if (entries.length > 0) entries.at(-1)!.body.push(line)
  }

  const names: string[] = []
  for (const {body, key} of entries) {
    const text = body.join('\n')
    if (/^\s+external:\s*true\b/m.test(text)) continue
    const own = /^\s+name:\s*["']?([A-Za-z0-9_.-]+)["']?/m.exec(text)
    names.push(own ? own[1] : `${project}_${key}`)
  }

  return names
}

/** The declared volumes that already exist on this Docker host (`docker volume ls` names). */
export function leftoverVolumes(declared: string[], existing: Iterable<string>): string[] {
  const have = new Set(existing)
  return declared.filter((n) => have.has(n))
}

/** Newest `<dir>/backups/<stamp>/` that holds a `.env.dist`, or undefined. Stamps sort chronologically. */
export async function latestEnvBackup(dir: string): Promise<string | undefined> {
  let stamps: string[]
  try {
    stamps = await readdir(`${dir}/backups`)
  } catch {
    return undefined
  }

  for (const stamp of stamps.sort().reverse()) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await stat(`${dir}/backups/${stamp}/.env.dist`)
      return `${dir}/backups/${stamp}`
    } catch {
      /* no env in this backup */
    }
  }

  return undefined
}
