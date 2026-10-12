import {execFile} from 'node:child_process'
import {chmod, writeFile} from 'node:fs/promises'

export class FileExistsError extends Error {
  readonly path: string

  constructor(path: string) {
    super(`${path} already exists`)
    this.name = 'FileExistsError'
    this.path = path
  }
}

/**
 * Writes the pulled variables with mode 0600 (owner only; ignored where the
 * OS has no such modes). Without `force` an existing file is never touched:
 * the open fails atomically (`wx`), so there is no check-then-write race.
 */
export async function writeEnvFile(path: string, text: string, force: boolean): Promise<void> {
  const body = text === '' || text.endsWith('\n') ? text : `${text}\n`
  try {
    await writeFile(path, body, {flag: force ? 'w' : 'wx', mode: 0o600})
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new FileExistsError(path)
    throw error
  }

  // `mode` only applies to a new file; tighten an overwritten one too.
  try {
    await chmod(path, 0o600)
  } catch {
    /* Windows ACLs do not map onto POSIX modes */
  }
}

export type GitIgnoreStatus = 'ignored' | 'no-git' | 'not-ignored'

export type GitExec = (args: string[], cwd: string) => Promise<'missing' | number>

/** Runs `git <args>` and resolves with its exit code, or `'missing'` when git is not installed. */
export const runGit: GitExec = (args, cwd) =>
  new Promise((resolve) => {
    execFile('git', args, {cwd, windowsHide: true}, (error) => {
      if (!error) {
        resolve(0)
        return
      }

      const {code} = error as {code?: number | string}
      if (code === 'ENOENT') resolve('missing')
      else resolve(typeof code === 'number' ? code : 1)
    })
  })

/**
 * Is `file` covered by the repo's ignore rules? Uses `git check-ignore -q`
 * (exit 0 ignored, 1 not ignored, 128 not a repository), so every ignore
 * source git knows about is honoured. No git or no repo means there is
 * nothing to warn about.
 */
export async function gitIgnoreStatus(file: string, cwd: string, exec: GitExec = runGit): Promise<GitIgnoreStatus> {
  const code = await exec(['check-ignore', '-q', '--', file], cwd)
  if (code === 0) return 'ignored'
  if (code === 1) return 'not-ignored'
  return 'no-git'
}
