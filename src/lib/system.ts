import {execFileSync, spawn} from 'node:child_process'

/** `aoox install` writes to a system path and manages Docker — root only. */
export function isRoot(): boolean {
  return typeof process.getuid === 'function' && process.getuid() === 0
}

export function commandExists(cmd: string): boolean {
  try {
    execFileSync(process.platform === 'win32' ? 'where' : 'which', [cmd], {stdio: 'ignore'})
    return true
  } catch {
    return false
  }
}

export function dockerRunning(): boolean {
  try {
    execFileSync('docker', ['info'], {stdio: 'ignore'})
    return true
  } catch {
    return false
  }
}

/** gid that owns the host's docker socket — the api container needs it (see .env.dist.example). */
export function dockerSocketGid(): string {
  try {
    return execFileSync('stat', ['-c', '%g', '/var/run/docker.sock']).toString().trim() || '0'
  } catch {
    return '0'
  }
}

/** Runs a shell one-liner with output visible as-is (used for the Docker installer). */
export function runShellInherit(script: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('sh', ['-c', script], {stdio: 'inherit'})
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`Perintah keluar dengan kode ${code}: ${script}`))
    })
  })
}

/** A bare, dotted-quad check — good enough to reject an HTML error page or empty body. */
export function isIpv4(text: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(text.trim())
}

/**
 * Same service aoox-api's own DNS check trusts (`check-domain-dns`)
 * when nothing more specific is configured — kept consistent so the panel's
 * own idea of "this server's IP" agrees with what the installer printed.
 */
export async function detectPublicIp(): Promise<string | undefined> {
  try {
    const res = await fetch('https://api.ipify.org', {signal: AbortSignal.timeout(5000)})
    if (!res.ok) return undefined
    const text = (await res.text()).trim()
    return isIpv4(text) ? text : undefined
  } catch {
    return undefined
  }
}
