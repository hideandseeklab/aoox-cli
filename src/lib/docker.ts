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
          ? new Error('docker not found in PATH. Install Docker Desktop or Docker Engine first.')
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
          ? new Error('docker not found in PATH. Install Docker Desktop or Docker Engine first.')
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

/** `docker <args>` capturing stdout; empty string on any failure (missing docker, non-zero exit). */
export function dockerCapture(args: string[], cwd?: string): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn('docker', args, {cwd, stdio: ['ignore', 'pipe', 'ignore']})
    let out = ''
    child.stdout.on('data', (chunk) => {
      out += String(chunk)
    })
    child.on('error', () => resolve(''))
    child.on('close', (code) => resolve(code === 0 ? out.trim() : ''))
  })
}

export type DockerEngineStatus = 'missing' | 'ok' | 'unreachable'

/**
 * Whether the local Docker engine answers: `docker version` exits non-zero when the CLI is
 * installed but the daemon (Docker Desktop, dockerd) is not running or the socket is wrong.
 */
export function dockerEngineStatus(timeoutMs = 10_000): Promise<DockerEngineStatus> {
  return new Promise((resolve) => {
    const child = spawn('docker', ['version', '--format', '{{.Server.Version}}'], {stdio: 'ignore'})
    const timer = setTimeout(() => {
      child.kill()
      resolve('unreachable')
    }, timeoutMs)
    child.on('error', (error: NodeJS.ErrnoException) => {
      clearTimeout(timer)
      resolve(error.code === 'ENOENT' ? 'missing' : 'unreachable')
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve(code === 0 ? 'ok' : 'unreachable')
    })
  })
}

/** What to print when the engine is not usable: a headline plus one hint line. */
export function dockerUnavailableLines(status: Exclude<DockerEngineStatus, 'ok'>): [string, string] {
  return status === 'missing'
    ? ['Docker is not installed (docker was not found in PATH).', 'Install Docker Desktop or Docker Engine, then try again.']
    : [
        'Cannot connect to the Docker engine.',
        'Start Docker Desktop (or the Docker service, e.g. `sudo systemctl start docker`), then try again.',
      ]
}
