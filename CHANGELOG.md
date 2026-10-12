# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Versions below 1.0.0 may include breaking changes in a minor release.

## [Unreleased]

### Changed

- **One npm tag: `latest`.** Releases publish under `latest` only; the publish workflow no longer tries to move an `alpha` tag (npm Trusted Publishing cannot move tags, so `alpha` was left behind on 0.1.0-alpha.7 while `latest` got 0.1.0-alpha.8). Install with `npm i -g @hideandseeklab/aoox` and upgrade with `aoox update`.

## [0.1.0-alpha.8] - 2026-10-12

### Changed

- **BREAKING: `aoox update` now updates the CLI itself; the panel update moved to `aoox update panel`.** `aoox update panel [--apply]` is the old `aoox update` unchanged (check or apply the panel's `aoox-api`/`aoox-web` update). The new `aoox update` finds the newest version on npm (a pre-release install follows the newest of the `latest` and `alpha` tags, a stable install never moves to a pre-release), and runs `npm i -g @hideandseeklab/aoox@<version>` when the CLI was installed with npm global; for the standalone tarball or a source/npx install it prints the exact command instead of guessing. `--check` only reports; it needs neither a login nor the panel. The old muscle memory `aoox update --apply` does not update anything: it prints `Panel updates moved to: aoox update panel --apply` and exits with an error.
- The outdated-CLI warning now says `Update it: aoox update`.
- `aoox deploy` shares the registry selection with the new registry commands, and warns when the registry address is `localhost:…` while the panel is remote (`aoox registry domain --set <host>`).
- Plain `aoox` also shows where the CLI is connected (see Added).
- **`aoox login` asks for the dashboard address, not the API address.** The prompt is now "Dashboard URL" (with a hint: your panel domain, or `http://<server-IP>:3000` when no panel domain is set). The CLI reads the API address from the dashboard's public discovery file (`/.well-known/aoox.json`, needs the matching web version), so nobody has to know the API port. The scheme can be left out: a bare host is tried over https then http, and a bare IP or `localhost` also on port 3000. If the dashboard does not advertise a public API address (it says `localhost`), the CLI assumes `<same host>:3001` and says so. `--url`/`AOOX_URL` now mean the dashboard address on every command (`login`, `link`, `deploy`, `whoami`, `update`, `domain set`, `registry domain`); an API address (from an older script or config) still works and prints a one-line note. `config.json` gets an additional `webUrl`; files written by older versions keep working (their `url` is the API address). `.aoox.json` is unchanged.
- **Clearer connection errors.** Instead of "Failed to parse URL" or "fetch failed", the CLI now says what is wrong: an https address that speaks plain HTTP ("Try http://…"), an unreachable host or timeout (check the firewall / security group, or set a panel domain: Infrastructure → Panel domain), an address that is not an aoox dashboard, and an untrusted TLS certificate. In the interactive prompt a wrong address is explained and asked again. The token is never printed.

### Added

- **`aoox registry build <name:version>`** builds `./Dockerfile` (`-f/--dockerfile`, `--context`) into a local image named `<registry host>/<name>:<version>` (the self-hosted registry by default, `--registry <id>` to choose). Before building it asks the registry (`HEAD /v2/<name>/manifests/<version>`, Basic or bearer-token auth) whether that version already exists and refuses unless `--force` (`latest` is always allowed), suggesting the next version. **`aoox registry push <name:version>`** pushes only an existing local image (short or full name), with the same existence check, an automatic `docker login` and a hint to use the image under New application → Ready-made image. A version is required and names are validated like the API's `imageRef`. Neither command deploys or needs `aoox link`.
- **`aoox` without arguments shows the connection**: the dashboard and API addresses from the saved login, and the default registry (one short `GET /registries`, 2 s limit; a failure prints `(could not check: …)`), or `Not connected — run: aoox login`. `aoox --help` and `aoox <command> --help` are unchanged.
- **Outdated CLI warning.** After `aoox login` and `whoami`, and at the start of `link`, `deploy`, `update`, `domain set` and `registry domain`, the CLI compares its version with the panel's (semver, so `alpha.9` is older than `alpha.10`) and prints a one-line warning with `npm i -g @hideandseeklab/aoox@latest`. It never fails a command; a slow or old panel is ignored.

## [0.1.0-alpha.7] - 2026-10-12

### Added

- `aoox install` now prepares the web terminal's SSH key itself: it creates `<dir>/secrets` (owned by uid 1000, mode 700),
  generates the `terminal_ssh_key` ed25519 pair with `ssh-keygen` if missing, and adds the public key to the
  `TERMINAL_SSH_USER` account's `~/.ssh/authorized_keys` (idempotent, correct modes and owner, never follows symlinks), so the terminal
  works right after installing. Any problem is only a warning (the Settings > Terminal button is the fallback); skipped when not root,
  not Linux, with an explicit key/password configured, or with the new `--no-terminal-authorize`. `aoox reinstall` does not touch it.

### Changed

- `aoox install` now defaults `TERMINAL_SSH_USER` to the person who ran `sudo` (`SUDO_USER`) instead of always
  `root`, falling back to `root` when there is no sudo user. Cloud images such as Ubuntu usually disable SSH login
  as root, so the web terminal failed with "SSH authentication failed for root@host.docker.internal" right after
  installing. `--terminal-ssh-user` still wins, and existing installs (`aoox reinstall`, `.env.dist` merge) keep
  their current value.
- CLI messages, command descriptions and help text are now in English (previously partly Indonesian).

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

[Unreleased]: https://github.com/hideandseeklab/aoox-cli/compare/v0.1.0-alpha.8...HEAD
[0.1.0-alpha.8]: https://github.com/hideandseeklab/aoox-cli/compare/v0.1.0-alpha.7...v0.1.0-alpha.8
[0.1.0-alpha.7]: https://github.com/hideandseeklab/aoox-cli/compare/v0.1.0-alpha.6...v0.1.0-alpha.7
[0.1.0-alpha.5]: https://github.com/hideandseeklab/aoox-cli/compare/v0.1.0-alpha.4...v0.1.0-alpha.5
[0.1.0-alpha.4]: https://github.com/hideandseeklab/aoox-cli/compare/v0.1.0-alpha.3...v0.1.0-alpha.4
[0.1.0-alpha.3]: https://github.com/hideandseeklab/aoox-cli/compare/v0.1.0-alpha.2...v0.1.0-alpha.3
[0.1.0-alpha.2]: https://github.com/hideandseeklab/aoox-cli/compare/v0.1.0-alpha.1...v0.1.0-alpha.2
[0.1.0-alpha.1]: https://github.com/hideandseeklab/aoox-cli/compare/v0.1.0-alpha.0...v0.1.0-alpha.1
[0.1.0-alpha.0]: https://github.com/hideandseeklab/aoox-cli/releases/tag/v0.1.0-alpha.0
