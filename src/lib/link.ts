import {readFile, writeFile} from 'node:fs/promises'
import {join} from 'node:path'

import {normalizeUrl} from './config.js'

/** What `aoox link` writes to the repo root — safe to commit (no secret). */
export interface LinkFile {
  applicationId: string
  applicationName: string
  projectId: string
  projectName: string
  url: string
}

export const LINK_FILE = '.aoox.json'

export function linkPath(cwd: string): string {
  return join(cwd, LINK_FILE)
}

export async function readLink(cwd: string): Promise<LinkFile | null> {
  const path = linkPath(cwd)
  let raw: string
  try {
    raw = await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }

  let parsed: Partial<LinkFile>
  try {
    parsed = JSON.parse(raw) as Partial<LinkFile>
  } catch {
    throw new Error(`File link rusak (bukan JSON yang sah): ${path}`)
  }

  if (!parsed.applicationId || !parsed.projectId || !parsed.url) {
    throw new Error(`File link tidak lengkap: ${path}. Jalankan \`aoox link\` lagi.`)
  }

  return {
    applicationId: parsed.applicationId,
    applicationName: parsed.applicationName ?? '',
    projectId: parsed.projectId,
    projectName: parsed.projectName ?? '',
    url: normalizeUrl(parsed.url),
  }
}

export async function writeLink(cwd: string, link: LinkFile): Promise<string> {
  const path = linkPath(cwd)
  await writeFile(path, `${JSON.stringify(link, null, 2)}\n`)
  return path
}
