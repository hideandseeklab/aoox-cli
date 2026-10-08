import {execFileSync} from 'node:child_process'
import {chmodSync, chownSync, existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import {posix} from 'node:path'

const {join} = posix

/**
 * Pre-authorizes the web terminal's SSH key during `aoox install`, so the
 * terminal works without the manual `authorized_keys` step. Behavior is a
 * contract shared with aoox-landing's install.sh — see "Terminal key" in
 * AGENTS.md; change both together.
 */

/** uid/gid of the `node` user inside the api image (it reads the key as this user). */
export const API_UID = 1000
export const API_GID = 1000
export const TERMINAL_KEY_COMMENT = 'aoox-terminal'
export const PRIVATE_KEY_FILE = 'terminal_ssh_key'
export const PUBLIC_KEY_FILE = 'terminal_ssh_key.pub'

type Chown = (path: string, uid: number, gid: number) => void

export interface TerminalKeyPlan {
  /** `ssh-keygen` arguments that create the keypair. */
  keygenArgs: string[]
  privateKey: string
  publicKey: string
  secretsDir: string
}

export function terminalKeyPlan(installDir: string): TerminalKeyPlan {
  const secretsDir = join(installDir, 'secrets')
  const privateKey = join(secretsDir, PRIVATE_KEY_FILE)
  return {
    keygenArgs: ['-q', '-t', 'ed25519', '-N', '', '-C', TERMINAL_KEY_COMMENT, '-f', privateKey],
    privateKey,
    publicKey: join(secretsDir, PUBLIC_KEY_FILE),
    secretsDir,
  }
}

export interface AuthorizeContext {
  /** An explicit private key or password is configured, so the platform key is not used. */
  explicitCredential: boolean
  noAuthorize: boolean
  platform: string
  root: boolean
  user: string | undefined
}

/** Why the automatic step is skipped (null = run it). Skips are silent except the opt-out. */
export function skipReason(c: AuthorizeContext): null | string {
  if (c.noAuthorize) return '--no-terminal-authorize'
  if (c.platform !== 'linux') return 'not Linux'
  if (!c.root) return 'not root'
  if (c.explicitCredential) return 'explicit terminal credential configured'
  if (!c.user || !isLoginName(c.user)) return 'no valid TERMINAL_SSH_USER'
  return null
}

export function isLoginName(name: string): boolean {
  return /^[a-z_][\w-]{0,31}$/i.test(name)
}

/** First non-empty line of a `.pub` file, if it is a single `authorized_keys` line. */
export function publicKeyLine(pub: string): null | string {
  const line = pub.split(/\r?\n/).find((l) => l.trim() !== '')?.trim()
  return line && /^ssh-[a-z0-9-]+ [A-Za-z0-9+/=]+( [\u0021-\u007E]+)?$/.test(line) ? line : null
}

export interface Account {
  gid: number
  home: string
  uid: number
}

/** Parses a `name:x:uid:gid:gecos:home:shell` line for `user` out of passwd-format text. */
export function parsePasswd(passwd: string, user: string): Account | null {
  for (const line of passwd.split('\n')) {
    const f = line.split(':')
    if (f[0] !== user || f.length < 6) continue
    const uid = Number(f[2])
    const gid = Number(f[3])
    const home = f[5]
    if (!Number.isInteger(uid) || !Number.isInteger(gid)) return null
    return home.startsWith('/') && home !== '/' && !home.split('/').includes('..') ? {gid, home, uid} : null
  }

  return null
}

/** Adds `key` as its own line unless an identical line exists; always ends with a newline. */
export function addAuthorizedKey(existing: string, key: string): {added: boolean; content: string} {
  if (existing.split(/\r?\n/).includes(key)) return {added: false, content: existing}
  const prefix = existing === '' || existing.endsWith('\n') ? existing : `${existing}\n`
  return {added: true, content: `${prefix}${key}\n`}
}

function setMode(path: string, mode: number): void {
  chmodSync(path, mode)
}

/**
 * Creates `~/.ssh` (700) and `authorized_keys` (600) under `home` if needed and
 * appends `key`. `owner` is applied with chown when given (running as root).
 * Returns whether the key was newly added.
 */
export function writeAuthorizedKey(
  home: string,
  key: string,
  owner?: {gid: number; uid: number},
  chown: Chown = chownSync,
): boolean {
  const sshDir = join(home, '.ssh')
  const file = join(sshDir, 'authorized_keys')
  for (const path of [sshDir, file]) {
    // Running as root: never follow a link the account owner could point elsewhere.
    if (existsSync(path) && lstatSync(path).isSymbolicLink()) throw new Error(`${path} is a symlink`)
  }

  mkdirSync(sshDir, {mode: 0o700, recursive: true})
  setMode(sshDir, 0o700)
  const existing = existsSync(file) ? readFileSync(file, 'utf8') : ''
  const {added, content} = addAuthorizedKey(existing, key)
  if (added || !existsSync(file)) writeFileSync(file, content)
  setMode(file, 0o600)
  if (owner) {
    chown(sshDir, owner.uid, owner.gid)
    chown(file, owner.uid, owner.gid)
  }

  return added
}

/** Creates the key directory (owned by the api user, 700) and the keypair if missing. */
export function ensureTerminalKey(
  plan: TerminalKeyPlan,
  run: (args: string[]) => void = defaultKeygen,
  chown: Chown = chownSync,
): 'created' | 'exists' {
  mkdirSync(plan.secretsDir, {recursive: true})
  chown(plan.secretsDir, API_UID, API_GID)
  setMode(plan.secretsDir, 0o700)
  if (existsSync(plan.privateKey)) return 'exists'
  run(plan.keygenArgs)
  setMode(plan.privateKey, 0o600)
  setMode(plan.publicKey, 0o644)
  chown(plan.privateKey, API_UID, API_GID)
  chown(plan.publicKey, API_UID, API_GID)
  return 'created'
}

/** `getent` first (LDAP/sssd users), then /etc/passwd. */
function readPasswd(user: string): string {
  try {
    return execFileSync('getent', ['passwd', user], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']})
  } catch {
    return readFileSync('/etc/passwd', 'utf8')
  }
}

function defaultKeygen(args: string[]): void {
  execFileSync('ssh-keygen', args, {stdio: 'ignore'})
}

export interface AuthorizeOutcome {
  /** Human-readable line for the installer log (a warning when `ok` is false). */
  message: string
  ok: boolean
}

/**
 * The whole step, never throwing: any failure becomes a warning so the
 * install itself is unaffected.
 */
export function authorizeTerminalKey(opts: {
  chown?: Chown
  installDir: string
  keygen?: (args: string[]) => void
  passwdText?: string
  user: string
}): AuthorizeOutcome {
  const fallback = 'terminal key not authorized automatically; use Settings > Terminal > authorize'
  try {
    const plan = terminalKeyPlan(opts.installDir)
    ensureTerminalKey(plan, opts.keygen, opts.chown)
    const key = publicKeyLine(readFileSync(plan.publicKey, 'utf8'))
    if (!key) return {message: `${fallback} (unreadable public key)`, ok: false}
    const account = parsePasswd(opts.passwdText ?? readPasswd(opts.user), opts.user)
    if (!account) return {message: `${fallback} (no usable home for ${opts.user})`, ok: false}
    const added = writeAuthorizedKey(account.home, key, account, opts.chown)
    return {message: `terminal key ${added ? 'authorized' : 'already authorized'} for ${opts.user}`, ok: true}
  } catch (error) {
    return {message: `${fallback} (${error instanceof Error ? error.message : String(error)})`, ok: false}
  }
}
