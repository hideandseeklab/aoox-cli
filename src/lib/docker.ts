import {spawn} from 'node:child_process'

export class DockerCommandError extends Error {
  readonly code: number

  constructor(command: string, code: number) {
    super(`\`${command}\` exited with code ${code}`)
    this.code = code
    this.name = 'DockerCommandError'
  }
}

/** Runs `docker <args>` with the child's stdout/stderr shown as-is (docker's own output is already readable). */
export function dockerInherit(args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, {cwd, stdio: 'inherit'})
    child.on('error', (error: NodeJS.ErrnoException) => {
      reject(
        error.code === 'ENOENT'
          ? new Error('docker tidak ditemukan di PATH. Pasang Docker Desktop/Engine dulu.')
          : error,
      )
    })
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new DockerCommandError(`docker ${args[0]}`, code ?? 1))
    })
  })
}

/**
 * `docker login <registry> -u <user> --password-stdin`: the password never
 * touches argv (visible in `ps`/Task Manager) or shell history.
 */
export function dockerLogin(registryUrl: string, username: string, password: string, cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', ['login', registryUrl, '--username', username, '--password-stdin'], {
      cwd,
      stdio: ['pipe', 'inherit', 'inherit'],
    })
    child.on('error', (error: NodeJS.ErrnoException) => {
      reject(
        error.code === 'ENOENT'
          ? new Error('docker tidak ditemukan di PATH. Pasang Docker Desktop/Engine dulu.')
          : error,
      )
    })
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new DockerCommandError('docker login', code ?? 1))
    })
    child.stdin.write(password)
    child.stdin.end()
  })
}
