/**
 * What `aoox install` does when it meets an existing installation. Pure so every
 * branch is unit-tested; the command only executes the returned plan.
 *
 * Why this exists: `--force` used to overwrite `.env.dist` with new random
 * POSTGRES_PASSWORD/JWT_SECRET/ENCRYPTION_KEY without a backup, while the old
 * postgres volume kept the old password — the API could no longer connect.
 */
export interface InstallPlanInput {
  /** Does `<dir>/docker-compose.dist.yml` exist? */
  composeExists: boolean
  /** Value of `--confirm-wipe` (must equal the resolved install dir). */
  confirmWipe?: string
  /** Resolved absolute install dir. */
  dir: string
  /** Does `<dir>/.env.dist` exist? */
  envExists: boolean
  force: boolean
  /** Does the existing `.env.dist` hold all of POSTGRES_PASSWORD, JWT_SECRET, ENCRYPTION_KEY? */
  hasSecrets: boolean
  /** A terminal is attached to stdin (a typed confirmation is possible). */
  interactive: boolean
  /** Newest `<dir>/backups/<stamp>` that holds a `.env.dist` (for the hint when a database volume is left over). */
  latestBackup?: string
  /** Volumes the stack declares that already exist on this Docker host (empty when Docker is not installed yet). */
  leftoverVolumes?: string[]
  newSecrets: boolean
  wipeData: boolean
  yes: boolean
}

export type InstallPlan =
  | {backup: true; confirm: 'flag' | 'typed'; kind: 'wipe'}
  /** Nothing installed in the folder: generate everything, no backup. */
  | {backup: true; confirm: 'prompt' | 'yes-flag'; kind: 'reuse'}
  /** Existing install, `--force`: back up, keep every secret and existing value, refresh files. */
  | {kind: 'error'; message: string; suggestions: string[]}
  /** Existing install, `--force --new-secrets --wipe-data`: back up, `down -v`, new secrets. */
  | {kind: 'fresh'}

const REINSTALL_HINT = 'To repair/refresh an existing installation without losing data: `sudo aoox reinstall`.'

function fail(message: string, ...suggestions: string[]): InstallPlan {
  return {kind: 'error', message, suggestions}
}

// eslint-disable-next-line complexity -- one flat decision table, easier to audit than split helpers
export function planInstall(i: InstallPlanInput): InstallPlan {
  if ((i.newSecrets || i.wipeData) && !i.force) {
    return fail('--new-secrets and --wipe-data only make sense together with --force.', REINSTALL_HINT)
  }

  if (i.newSecrets && !i.wipeData) {
    return fail(
      '--new-secrets without --wipe-data is refused: new secrets cannot unlock the existing database. The old postgres volume keeps the old password, so the API could no longer connect and every stored credential would be undecryptable.',
      'To start completely from scratch (this DELETES all data): --force --new-secrets --wipe-data',
      'To keep your data: use --force without --new-secrets (existing secrets are reused), or `sudo aoox reinstall`.',
    )
  }

  if (i.wipeData && !i.newSecrets) {
    return fail(
      '--wipe-data without --new-secrets is refused: wiping the data and then reusing the old secrets is a half-reset (leftover credentials, 2FA and encryption key tied to data that is gone). A clean start always gets new secrets.',
      'For a completely fresh install: --force --new-secrets --wipe-data',
    )
  }

  if (i.confirmWipe !== undefined && !(i.force && i.newSecrets && i.wipeData)) {
    return fail('--confirm-wipe only applies together with --force --new-secrets --wipe-data.')
  }

  const existing = i.composeExists || i.envExists
  const leftover = i.leftoverVolumes ?? []
  if (!existing && leftover.length === 0) return {kind: 'fresh'}
  if (!existing && !(i.newSecrets && i.wipeData)) return leftoverFailure(i, leftover)

  if (!i.force) {
    return fail(`An installation already exists in ${i.dir}.`, REINSTALL_HINT,
      'To reinstall over it keeping your data and secrets (previous files are backed up first): add --force.',
      'To start completely from scratch (DELETES all data): --force --new-secrets --wipe-data')
  }

  if (i.newSecrets && i.wipeData) {
    if (i.confirmWipe !== undefined) {
      if (i.confirmWipe !== i.dir) {
        return fail(`--confirm-wipe must be exactly the install directory (${i.dir}); got "${i.confirmWipe}".`)
      }

      return {backup: true, confirm: 'flag', kind: 'wipe'}
    }

    if (!i.interactive) {
      return fail(
        `Wiping ${i.dir} needs an explicit confirmation, and --yes alone is not enough.`,
        `Add --confirm-wipe=${i.dir} (non-interactive), or run it in a terminal and type the path when asked.`,
      )
    }

    return {backup: true, confirm: 'typed', kind: 'wipe'}
  }

  if (!i.hasSecrets) {
    return fail(
      `${i.dir}/.env.dist is missing POSTGRES_PASSWORD, JWT_SECRET or ENCRYPTION_KEY, so the existing secrets cannot be reused (inventing new ones would cut off the existing data).`,
      'Restore .env.dist from your backup, then run it again.',
      'If you really want to discard the old data: --force --new-secrets --wipe-data',
    )
  }

  return {backup: true, confirm: i.yes ? 'yes-flag' : 'prompt', kind: 'reuse'}
}

function leftoverFailure(i: InstallPlanInput, leftover: string[]): InstallPlan {
  const restore = i.latestBackup
    ? `Restore the old settings and repair in place (keeps the data): cp ${i.latestBackup}/.env.dist ${i.dir}/.env.dist && sudo aoox reinstall --dir ${i.dir}`
    : `Restore the old .env.dist (POSTGRES_PASSWORD, JWT_SECRET, ENCRYPTION_KEY) into ${i.dir}/.env.dist from wherever you saved it, then run: sudo aoox reinstall --dir ${i.dir}`
  return fail(
    `Docker already has data volumes from an earlier aoox installation: ${leftover.join(', ')}. A new install would generate a new POSTGRES_PASSWORD that cannot open that data, and the API would never start. Nothing was changed.`,
    restore,
    'Or start from scratch and DELETE that data: sudo aoox install --force --new-secrets --wipe-data',
  )
}

/** Text shown before a wipe — must say plainly what is lost. */
export function wipeWarning(dir: string, leftover: string[] = []): string[] {
  const left = leftover.length > 0 ? [`Leftover Docker volumes that are removed too: ${leftover.join(', ')}.`] : []
  return [
    ...left,
    `This will PERMANENTLY DELETE the aoox panel data in ${dir}:`,
    '  - the panel database (users, projects, applications, domains, settings) — the postgres volume is removed with `docker compose down -v`',
    '  - every stored credential (registry, git, S3, notifications, 2FA, API tokens) — new secrets are generated',
    'Not deleted: containers/volumes aoox created for your applications, databases and registry, and the files in the install folder. The previous .env.dist and compose files are copied to the backups folder first (they only contain the OLD secrets, which no longer match anything).',
  ]
}

export interface ExplicitInstallFlags {
  acmeEmail?: string
  adminEmail?: string
  adminName?: string
  adminPassword?: string
  apiDomain?: string
  terminalSshUser?: string
  webDomain?: string
}

/**
 * `.env.dist` keys the user set explicitly on the command line. In reuse mode
 * only these replace an existing value; everything else the installer would
 * write keeps what the installation already has.
 */
export function explicitOverrides(f: ExplicitInstallFlags): Record<string, string> {
  const out: Record<string, string> = {}
  if (f.webDomain && f.apiDomain) {
    out.WEB_DOMAIN = f.webDomain
    out.API_DOMAIN = f.apiDomain
    out.WEB_ORIGIN = `https://${f.webDomain}`
    out.PUBLIC_API_URL = `https://${f.apiDomain}`
  }

  if (f.acmeEmail) out.PROXY_ACME_EMAIL = f.acmeEmail
  if (f.adminEmail) out.ADMIN_EMAIL = f.adminEmail
  if (f.adminName) out.ADMIN_NAME = f.adminName
  if (f.adminPassword) out.ADMIN_PASSWORD = f.adminPassword
  if (f.terminalSshUser) out.TERMINAL_SSH_USER = f.terminalSshUser
  return out
}
