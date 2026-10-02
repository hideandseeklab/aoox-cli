# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Versions below 1.0.0 may include breaking changes in a minor release.

## [Unreleased]

## [0.1.0-alpha.5] - 2026-10-02

### Changed

- Project metadata for discoverability (no behavior change): `package.json` `homepage` now points to https://aoox.dev (was the GitHub repo) — it becomes the Homepage
  link on the npm page — and `description`/`keywords` are richer (self-hosted, paas, docker, deploy, git-deploy, cli,
  nixpacks, railpack, traefik); `bugs` is now the object form. The top of the README links to the website, docs and
  changelog and to the other repos (outside the `oclif readme` markers, so regenerating it keeps them).

- Bundled `assets/install/docker-compose.dist.yml` re-synced with aoox-api: it now forwards `API_IMAGE`, `WEB_IMAGE`,
  `WEBHOOK_VERIFY_GITHUB_IP` and `PREVIEW_DOMAIN` to the `api` container. `aoox install` needs no new `.env.dist`
  lines for them (all optional, nothing meaningful to write), and `aoox reinstall` never adds them either — it only
  rewrites the compose file, which is how an older install picks the variables up (tests cover both, plus that the
  compose fallbacks for the image pins equal the `image:` defaults).

## [0.1.0-alpha.4] - 2026-09-29

### Added

- **`aoox reinstall`** — repairs/refreshes an existing panel install without losing data. `aoox update`
  (and the dashboard's "Apply update") only `pull` + `up -d`: they never rewrite `docker-compose.dist.yml`
  or add new keys to `.env.dist`, so older installs miss fixes that need a compose/env change (e.g.
  Terminal's `TERMINAL_SSH_USER is not set`, `PUBLIC_API_URL` not reaching the api service). It backs up the
  files it will change to `<dir>/backups/<timestamp>/` (`.env.dist` stays mode 600), rewrites
  `docker-compose.dist.yml` (and `docker-compose.domain.yml` if present) from the bundled copy, **merges**
  `.env.dist` (existing values, order, comments and unknown keys are kept byte for byte; only missing keys
  that have a safe default — taken from `buildEnvFile` and only when they differ from the compose file's own
  `${VAR:-default}` — are appended; the three secrets are never regenerated, and it refuses to run if
  `POSTGRES_PASSWORD`/`JWT_SECRET`/`ENCRYPTION_KEY` is missing), then `docker compose pull` +
  `up -d --force-recreate` with the same `-f` list the running api container was started with (its
  `com.docker.compose.project.config_files` label, trusted only when its working_dir is this folder;
  fallback: dist, domain, and `docker-compose.override.yml` if present — Compose only auto-includes the
  override for a file named `docker-compose.yml`). `docker-compose.override.yml` is never touched. Flags:
  `--dir`, `--dry-run` (plan + line diff, changes nothing), `--yes`, `--no-pull`,
  `--terminal-ssh-user`. Idempotent: with nothing to change it writes no file and makes no backup.
  Verified end to end inside a `docker:dind` container: a real `0.1.0-alpha.2` stack (alpha.2 compose + images, no
  `TERMINAL_SSH_USER`, plus a panel-made override) upgraded to the current images — dry-run, apply, second run;
  login, Postgres data and the override survived, `TERMINAL_SSH_USER=root` reached the api container; also a stale
  compose (missing a line) and a missing-`JWT_SECRET` refusal. Unit tests cover merge, compose-file selection and diff.
- `aoox install --force` now warns loudly (and defaults the prompt to "no") when the target already has an
  `.env.dist` with secrets — it would replace them and orphan the old database and every stored credential —
  and the "already installed" error points to `aoox reinstall`.

- Standalone install script support: `oclif pack tarballs` is now configured (`package.json`'s
  `oclif.update.node`, pinned Node 22.11.0) for `linux-x64`/`linux-arm64`/`darwin-x64`/
  `darwin-arm64`, bundling a Node.js runtime with the CLI so it can be installed on a machine with
  no Node.js at all — see `aoox-landing/public/install-cli.sh`. New
  `.github/workflows/release-tarballs.yml` builds these tarballs on every version tag (alongside,
  not instead of, the existing npm publish) and uploads them to a GitHub Release: the original
  `<bin>-v<version>-<sha>-<platform>-<arch>.tar.gz`/`.tar.xz` oclif produces, a stable-named copy
  of each (`aoox-<platform>-<arch>.tar.gz`/`.tar.xz` — oclif's own naming embeds the commit sha, so
  it can't be a stable download URL) that the install script actually fetches, and a `.sha256`
  checksum file for every one of them. Tags with a pre-release version are marked as a GitHub
  prerelease. `@oclif/plugin-plugins` was kept (undecided whether to drop it) despite pulling in a
  full copy of the `npm` CLI as a dependency for its "install a plugin" feature — verified this
  contributes ~17 MB of the ~32 MB of installed `node_modules` in a built tarball (the bundled
  Node.js runtime itself is the other ~112 MB, for ~145 MB installed / ~30–47 MB downloaded
  depending on `.tar.xz` vs `.tar.gz`).
- README's Installation section now leads with the install script for Linux/macOS, keeping npm as
  the path for Windows, Alpine (musl — the bundled Node.js binary needs glibc), or anyone who
  already has Node.js. `RELEASING.md` documents the new release workflow and asset layout.

## [0.1.0-alpha.3] - 2026-09-28

### Changed

- Version aligned with aoox 0.1.0-alpha.3; no functional changes to the CLI. The bundled compose
  files are unchanged.

## [0.1.0-alpha.2] - 2026-09-27

### Added

- `aoox domain set` now prints a warning with manual troubleshooting steps (DNS, firewall, waiting
  for the ACME certificate) when the API auto-provisioned the reverse proxy because it wasn't
  running yet.
- `aoox install` now defaults `TERMINAL_SSH_USER` to `root` in the generated `.env.dist` (override
  with `--terminal-ssh-user`), instead of leaving it blank — the install itself already requires
  root, so the web terminal is ready to use against the host right after install (still needs the
  one-time authorize command from Settings → Terminal, since the API can't write `authorized_keys`
  itself).

### Fixed

- Bundled `assets/install/docker-compose.dist.yml` updated to match the copy in `aoox-api`:
  `PUBLIC_API_URL` is now also declared for the `api` service (it was already there for `web`), fixing
  webhook URLs and the panel-domain status card always showing `localhost` on a fresh install even
  after a custom API domain was set.

## [0.1.0-alpha.1] - 2026-09-26

### Added

- `aoox domain set --web <host> --api <host> [--acme-email <email>]`: set a custom domain for the
  panel itself from the CLI, calling the panel's new `PATCH /instance/domain`.
- `aoox install` now writes `INSTALL_DIR` into `.env.dist`, so a freshly installed panel can use
  Settings → "Domain panel" (or `aoox domain set`) right away without an extra manual env edit.
- `aoox registry domain --set <host>` / `--clear`: set or remove a custom domain for the
  self-hosted registry, calling the panel's new `PATCH /registries/:id/domain`.
- `aoox update [--apply]`: check or apply an update for the panel itself, calling the panel's new
  `GET /instance/update` / `POST /instance/update/apply`.
- CI (`.github/workflows/ci.yml`): build + test (which already lints via `posttest`) on every pull
  request and push to `main` — previously the only workflow ran on version tags (npm publish), so
  a broken PR could merge unnoticed.

### Fixed

- `assets/install/docker-compose.dist.yml` was out of sync with aoox-api's copy (missing the new
  `INSTALL_DIR` var) — re-synced, per the drift check in `install-env-coverage.test.ts`.

## [0.1.0-alpha.0] - 2026-09-25

### Added

- Initial public alpha release, published to npm under the `alpha` dist-tag.
- `aoox login` — save the panel URL and an API token for other commands.
- `aoox link` — connect a local repo folder to an application on the panel.
- `aoox deploy` — build an image locally, push it to a registry, and trigger a deploy.
- `aoox install` — bootstrap aoox (postgres + api + web) on a fresh VPS via Docker Compose.
- `aoox whoami` — show the account and panel currently in use.

[Unreleased]: https://github.com/hideandseeklab/aoox-cli/compare/v0.1.0-alpha.5...HEAD
[0.1.0-alpha.5]: https://github.com/hideandseeklab/aoox-cli/compare/v0.1.0-alpha.4...v0.1.0-alpha.5
[0.1.0-alpha.4]: https://github.com/hideandseeklab/aoox-cli/compare/v0.1.0-alpha.3...v0.1.0-alpha.4
[0.1.0-alpha.3]: https://github.com/hideandseeklab/aoox-cli/compare/v0.1.0-alpha.2...v0.1.0-alpha.3
[0.1.0-alpha.2]: https://github.com/hideandseeklab/aoox-cli/compare/v0.1.0-alpha.1...v0.1.0-alpha.2
[0.1.0-alpha.1]: https://github.com/hideandseeklab/aoox-cli/compare/v0.1.0-alpha.0...v0.1.0-alpha.1
[0.1.0-alpha.0]: https://github.com/hideandseeklab/aoox-cli/releases/tag/v0.1.0-alpha.0
