/**
 * The panel-domain option "Only allow access through the domain" writes a
 * `docker-compose.override.yml` that uses the YAML `!override` tag. Docker
 * Compose only understands it from 2.24.4; an older plugin fails to parse the
 * file, so `aoox reinstall` checks the host's version before it runs
 * `docker compose` with that override.
 */
export const MIN_COMPOSE_FOR_OVERRIDE = '2.24.4'

/** `[major, minor, patch]` from `docker compose version --short` output ("2.29.1", "v2.24.4-desktop.1"), or undefined. */
export function parseComposeVersion(raw?: string): [number, number, number] | undefined {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec((raw ?? '').trim())
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : undefined
}

/** True when `version` is at least `min` ("2.24.4"). An unparsable version is never "at least". */
export function composeAtLeast(version?: string, min: string = MIN_COMPOSE_FOR_OVERRIDE): boolean {
  const have = parseComposeVersion(version)
  const need = parseComposeVersion(min)
  if (!have || !need) return false
  for (let i = 0; i < 3; i++) {
    if (have[i] !== need[i]) return have[i] > need[i]
  }

  return true
}

/** Whether the override file uses the `!override` tag outside a comment line. */
export function usesOverrideTag(content?: string): boolean {
  return (content ?? '').split(/\r?\n/).some((line) => !line.trimStart().startsWith('#') && /!override\b/.test(line))
}

/**
 * The refusal text when the override needs `!override` but the host Compose is
 * too old or its version could not be read; undefined when it is fine.
 */
export function overrideGuardMessage(overrideContent?: string, composeVersion?: string): string | undefined {
  if (!usesOverrideTag(overrideContent) || composeAtLeast(composeVersion)) return undefined
  const found = parseComposeVersion(composeVersion)
    ? `Docker Compose ${composeVersion?.trim()} is installed`
    : 'The Docker Compose version could not be read (`docker compose version --short`)'
  return (
    `${found}, but docker-compose.override.yml uses the YAML !override tag (the dashboard option ` +
    `"Only allow access through the domain"), which needs Docker Compose ${MIN_COMPOSE_FOR_OVERRIDE} or newer. ` +
    'Nothing was changed. Either upgrade the Docker Compose plugin (e.g. `sudo apt-get install --only-upgrade docker-compose-plugin`, ' +
    'or follow https://docs.docker.com/compose/install/linux/), or open the dashboard and turn off ' +
    '"Only allow access through the domain" in the panel domain settings first, then run this command again.'
  )
}
