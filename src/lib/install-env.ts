/** Everything `aoox install` needs to fill in `.env.dist` (see aoox-api's `.env.dist.example`). */
export interface InstallEnvOptions {
  acmeEmail?: string
  adminEmail?: string
  adminName?: string
  adminPassword?: string
  apiDomain?: string
  dockerGid: string
  encryptionKey: string
  /** Absolute path of the install folder on this host — enables Settings -> "Domain panel". */
  installDir: string
  jwtSecret: string
  postgresPassword: string
  publicApiUrl: string
  publicIp?: string
  webDomain?: string
  webOrigin: string
}

/**
 * Renders a ready-to-use `.env.dist` — not a template fill-in of the
 * commented `.env.dist.example` (fragile to keep in sync with prose), a
 * fresh file with the same keys the compose file reads. Pure so the choices
 * above (what's generated vs. defaulted vs. left blank) are unit-testable
 * without touching a filesystem or a VPS.
 */
export function buildEnvFile(o: InstallEnvOptions): string {
  const lines = [
    '# Written by `aoox install`. Secrets below are generated — keep this file private.',
    '',
    `POSTGRES_PASSWORD=${o.postgresPassword}`,
    `JWT_SECRET=${o.jwtSecret}`,
    `ENCRYPTION_KEY=${o.encryptionKey}`,
    '',
    `WEB_PORT=3000`,
    `API_PORT=3001`,
    `WEB_ORIGIN=${o.webOrigin}`,
    `PUBLIC_API_URL=${o.publicApiUrl}`,
    // Blank = auto (Secure only when WEB_ORIGIN is https://) — compose defaults
    // it the same way when the var is unset; written anyway so the file reads
    // the same as a human following .env.dist.example would leave it.
    `COOKIE_SECURE=`,
    `PUBLIC_IP=${o.publicIp ?? ''}`,
    `STORAGE_PATH=`,
    `INSTALL_DIR=${o.installDir}`,
    '',
    `WEB_DOMAIN=${o.webDomain ?? ''}`,
    `API_DOMAIN=${o.apiDomain ?? ''}`,
    `PROXY_ACME_EMAIL=${o.acmeEmail ?? ''}`,
    `PROXY_ACME_STAGING=false`,
    '',
    `ADMIN_EMAIL=${o.adminEmail ?? ''}`,
    `ADMIN_PASSWORD=${o.adminPassword ?? ''}`,
    `ADMIN_NAME=${o.adminName ?? ''}`,
    '',
    `TERMINAL_SSH_HOST=host.docker.internal`,
    `TERMINAL_SSH_PORT=22`,
    `TERMINAL_SSH_USER=`,
    `TERMINAL_SSH_PRIVATE_KEY_FILE=`,
    `TERMINAL_SSH_PASSPHRASE=`,
    `TERMINAL_SSH_PASSWORD=`,
    '',
    `DOCKER_GID=${o.dockerGid}`,
    '',
    `REGISTRY_PORT=5000`,
    `REGISTRY_PUBLIC_HOST=localhost`,
    '',
    `PROXY_HTTP_PORT=80`,
    `PROXY_HTTPS_PORT=443`,
    '',
    `CONTAINER_LOG_MAX_SIZE=10m`,
    `CONTAINER_LOG_MAX_FILE=3`,
    `METRICS_RETENTION_DAYS=30`,
    '',
    `RAILPACK_VERSION=0.39.0`,
    `BUILDKIT_VERSION=v0.27.0`,
    `BUILDKIT_CACHE_KEEP_GB=10`,
  ]
  return `${lines.join('\n')}\n`
}
