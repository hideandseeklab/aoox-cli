import {compareVersions} from './version.js'

/** The `version` block of `GET /instance/update` (absent on older APIs). */
export interface VersionBlock {
  applying?: boolean
  currentVersion?: string
  latestVersion: null | string
  trackedTag?: null | string
  tracking: 'latest' | 'pinned' | 'unknown'
  updateAvailable?: boolean
}

/** The published version when it is strictly newer than the running one; null otherwise (or when unknown). */
export function newerPublishedVersion(version: undefined | VersionBlock, running: string): null | string {
  const latest = version?.latestVersion
  if (!latest) return null
  const cmp = compareVersions(latest, running)
  return cmp !== null && cmp > 0 ? latest : null
}

/** Lines explaining why a pinned install does not move to `latest`, and what to do. */
export function pinnedAdvice(latest: string, running: string): string[] {
  return [
    `A newer version is published: ${latest} (running ${running}).`,
    'This install is pinned to a version tag (API_IMAGE / WEB_IMAGE), so `docker compose pull` never moves it and `aoox update panel --apply` would not change the version.',
    'To upgrade: in <install dir>/.env.dist set API_IMAGE and WEB_IMAGE to the new tag',
    `  (hideandseeklab/aoox-api:${latest} and hideandseeklab/aoox-web:${latest}),`,
    '  or delete those two lines to follow `latest`; then run `sudo aoox reinstall` (it pulls and recreates the containers, which keep their old env until recreated).',
  ]
}
