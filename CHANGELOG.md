# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Versions below 1.0.0 may include breaking changes in a minor release.

## [Unreleased]

### Added

- `aoox domain clear` (with `--yes`) removes the panel's custom domain and goes back to IP access (`http://<server IP>:3000`), asking for confirmation first. Applications and their domains are not touched.
- `aoox domain set --domain-only` (and `--no-domain-only` to undo it) turns on the panel's "only allow access through the domain" option: ports 3000/3001 then listen on 127.0.0.1 only. Needs both `--web` and `--api`; the command prints the recovery steps in case the domain stops working. Omitting the flag keeps the current setting.

- `aoox registry build` and `aoox registry push` no longer need `name:version` typed in full. With no argument, or a name without a version, the CLI fills it in from the project (the build context for `build`, the current folder for `push`): `package.json`, `pyproject.toml`, `Cargo.toml`, `composer.json`, `pubspec.yaml`, a single `*.csproj`, `pom.xml`, then a `VERSION` file, then the git tag HEAD is on, and the folder name for the name. The first source that has a value wins and the output says which (for example `name from folder, version from git tag v1.4.2`). Names are lowercased with the npm scope removed (`@acme/web` becomes `web`), and `+` in a version becomes `_`. A typed `name:version` still wins and reads nothing; the "version already exists" refusal still applies and now says where to bump the version.
- A name or version taken from the project is confirmed before anything is built or pushed: `Build web:1.4.2? (Y/n/e)` (continue, abort, or edit). `--yes` / `-y` skips the question; without a terminal, or with `CI` set, the command refuses and asks for `name:version` or `--yes`. A fully typed `name:version` never asks.
- If HEAD is past the last git tag, `registry build|push` refuses to guess a version; add `--force` to use the `git describe` form (for example `1.4.2-3-gabc1234`).

### UI UX Improvement

- Step lines (`==> ...`), results, warnings and hints are coloured when the output is a terminal: bold cyan `==>`, green results (with a check mark only when colour is on), a yellow `warn` label like the red `error` one, dim secondary text and cyan values. `NO_COLOR` and `FORCE_COLOR` are honoured, each stream decides for itself, and plain output keeps its old text. Warnings now print as `warn  text` on stderr instead of oclif's `Warning: text`. docker output and machine-readable output (`aoox env pull` to stdout) stay untouched.

### Fixed

- Pressing Ctrl+C at any prompt (the build/push confirmation, `login`, `link`, `deploy`, `install`, `domain clear`, `env` confirmations) now prints a plain `Aborted.` and exits with code 130, instead of printing `ExitPromptError: User force closed the prompt with SIGINT` and exiting 1.
- The bundled `docker-compose.dist.yml` passes `WEB_PORT` to the api service, so the address shown after removing the panel domain uses the real web port instead of always 3000.
- `aoox reinstall --dry-run` now also checks the Docker Compose version when `docker-compose.override.yml` uses the `!override` tag: it prints a warning (and still exits 0, nothing is changed) when Compose is older than 2.24.4 or unreadable, or says the version could not be checked when Docker is not available.
- `aoox reinstall` stops before changing anything when `docker-compose.override.yml` uses the `!override` tag (the dashboard option "Only allow access through the domain") and the host's Docker Compose is older than 2.24.4 or its version cannot be read. The message says to upgrade the Compose plugin or turn that option off in the dashboard first. `aoox install` and `aoox update` do not run the override on the host, so they need no check.
- The bundled `docker-compose.dist.yml` passes the optional `TRUST_PROXY` to the api service (which proxy hops may set the client IP); `aoox install` does not write it into a new `.env.dist`.
- **Works behind antivirus HTTPS scanning and corporate proxies.** Every request to the panel failed with "The TLS certificate … is not trusted" when an antivirus (AVG, Avast, Kaspersky, ESET, Bitdefender) or proxy (Zscaler, Netskope, Fortinet, Palo Alto) re-signed HTTPS with a root that is installed in the OS store only. The CLI now trusts the operating system's certificate store in addition to Node's bundled list (and `NODE_EXTRA_CA_CERTS`) on Node 22.19+ / 24.5+; older Node keeps today's behaviour. Certificate verification is never disabled. Set `AOOX_SYSTEM_CA=0` to opt out.
- Error lines no longer start with an emoji whose width some terminals miscount (the text looked glued to it); they start with a red `error` label, like the `warn` label of `aoox run`.

### Changed

- An unknown-issuer certificate error now names the issuer (for example "AVG Web/Mail Shield Root") and says an antivirus or proxy is probably inspecting HTTPS, with the fixes: antivirus exclusion, `NODE_EXTRA_CA_CERTS`, or `NODE_OPTIONS=--use-system-ca` on older Node. Expired, self-signed and wrong-name certificates keep their wording.

## [0.1.0-alpha.11] - 2026-10-15

### Fixed

- `aoox link` help no longer mentions a non-existent `aoox logs`; it now says the link is used by `aoox deploy`, `aoox run` (without `--set`/`--env`) and the `aoox env` defaults and links.

## [0.1.0-alpha.10] - 2026-10-13

### Breaking changes

- **Update the CLI together with the panel.** `aoox env` and `aoox run` from 0.1.0-alpha.9 get 404 from a panel on 0.1.0-alpha.10, and the new CLI needs the new panel (variable sets). Flags changed (`--set`/`--env` instead of `--project`; `diff`/`promote` take `--from`/`--to`) and `${{project.KEY}}` is refused in favour of `${{vars.KEY}}`; details below.

### Changed

- **Breaking: `aoox env` and `aoox run` work on variable sets.** The panel replaced its per-project environments with platform-level variable sets (each with its own environments, shared with all or selected projects, linked to applications and stacks in order). The 0.1.0-alpha.9 commands called endpoints that no longer exist and failed with 404. A set environment is now chosen with `--set/-s <slug>` and `--env/-e <name>`; `--project` and the `development` default are gone.
  - Defaults: `--set` is the only set the linked application links (or the only set you can see), `--env` the only environment of that set it links. With several candidates the command stops and lists them; it never guesses.
  - `aoox env list` (also `aoox env sets`) lists the sets you can see with your role, sharing and each environment's variable count; `--set` shows one set, `--env` the variable names of one environment, `--reveal` the values.
  - `pull`, `push --file`, `set`, `unset` and `history` work as before on the chosen set environment (a change made by someone else in between is still refused with "Nothing was written").
  - `aoox env diff --from <env> --to <env>` and `aoox env promote --from <env> --to <env> KEY…|--all` compare and copy within one set (previously positional `<from> <to>`).
  - A refusal on a protected environment now says "only instance owners and admins can read/change it" (protected environments are no longer open to project admins).
  - `env set` and `env push` refuse `${{project.KEY}}`, which was renamed to `${{vars.KEY}}`.
- **`aoox run` uses what the application gets at deploy time.** By default it reveals the linked set environments in order (a later one wins on the same key), then puts the application's own env on top, then `--file`. `${{vars.KEY}}` is replaced by the merged set value (one level, like the panel); `${{database…}}` and `${{secret…}}` references are left as written with a warning naming the variables, and Infisical-synced secrets are not included. If any linked environment cannot be read, nothing is started. `--set/--env` runs with exactly one set environment instead (no links, no own env). `--stack <id>` uses a compose stack instead of the linked application.
- **`aoox run` announces what it injects.** Before the command starts, stderr gets one line, for example `aoox  Injecting 12 variables into your process · Application "web": common/development < backend/development < own env` (with `--set/--env`: `Injecting 5 variables from common/development (no links, no own env)`). The count is what aoox adds or overrides in the command's environment (linked sets, own env and `--file`), not the variables it inherits from your shell. The line is coloured only on a terminal (`NO_COLOR` turns colour off, `FORCE_COLOR` forces it, nothing is coloured in pipes or CI logs), and warnings now start with a `warn` label.

### Added

- **`aoox run --quiet` / `-q`** hides the "Injecting N variables" line and the informational notes. Warnings about unresolved references and excluded Infisical secrets are always printed.
- **`aoox env links`, `aoox env link --set --env [--position n]` and `aoox env unlink`** show and change the ordered list of set environments the linked application (or `--stack <id>`) uses. Positions are 1-based; `link` adds at the end (the new link wins) unless `--position` is given and moves an environment that is already linked; `unlink` takes `--set --env` or `--position`. The list shows which variables a later link or the own env overrides. Changes take effect on the next deploy.

## [0.1.0-alpha.9] - 2026-10-13

### Changed

- **One npm tag: `latest`.** Releases publish under `latest` only; the publish workflow no longer tries to move an `alpha` tag (npm Trusted Publishing cannot move tags, so `alpha` was left behind on 0.1.0-alpha.7 while `latest` got 0.1.0-alpha.8). Install with `npm i -g @hideandseeklab/aoox` and upgrade with `aoox update`.

### Added

- **`aoox env` and `aoox run`: project environment variables from the terminal.** The project is the one of the application linked with `aoox link` (asked from the panel) or `--project <id|name>`; `--env/-e` picks the environment (default `development`).
  - `aoox env history [--limit 20]` shows an environment's version history (when, who, and the variable names added `+`, changed `~` or removed `-`; never values). `aoox env diff <from> <to>` compares two environments by name (only on one side, different values, same); values are only compared when you may read both, otherwise it says so. `aoox env promote <from> <to> [KEY…] [--all] [--yes]` copies chosen variables (and their secret flag) into another environment after showing what changes and asking; without a terminal it refuses unless `--yes`. All three print names only.
  - `aoox env push --file <f> [--yes]` replaces an environment with a local `.env` file after showing the added, changed and removed names. The file is checked first: invalid names, an `export` prefix, trailing whitespace and duplicate names are refused; quoted values are accepted with a warning because aoox stores quotes as they are. A change made by someone else in between is refused.
  - `aoox env pull --format dotenv|json|shell` and `--file -` (standard output, nothing else printed there, so `eval "$(aoox env pull --format shell --file -)"` and `| jq` work). Shell output uses single quotes. The default file is `.env`, `.env.json` or `.env.sh` by format.
  - `aoox env set KEY=VALUE --secret` marks variables as secret (always masked in logs) and `--no-secret` as explicitly not secret (never masked); `aoox env list --env <name>` shows `[secret]` after secret variables.
  - `aoox run --file .env.local -- <command>`: a local file layered on top of the environment; precedence is the current environment, then aoox, then the file (the file wins). The file is only read.
  - `aoox env list` lists the project's environments (protection, variable count, what uses them); with `--env` it lists that environment's variable names (values masked) and `--reveal` shows the values through the audited reveal action. `--json` is supported.
  - `aoox env pull [--file .env] [--force]` writes the variables with mode 0600, refuses to overwrite an existing file without `--force`, and warns once (via `git check-ignore`) when the file is not covered by `.gitignore`. It never edits `.gitignore`.
  - `aoox env set KEY=VALUE […]` and `aoox env unset KEY […]` read, change and write back the text, keeping comments and the order of the other lines, and send the version they read, so a change made by someone else in between is refused with "Nothing was written" (exit 1) instead of being overwritten. Values are stored exactly as the shell passes them (no quote processing: the panel and the container have none either); names are validated like the API, and a newline or trailing whitespace in a value is refused.
  - `aoox run [--env name] -- <command> [args…]` starts the command with the environment's variables on top of the current environment, nothing written to disk, inherited stdio, the exit code forwarded (a signal gives 128+n) and SIGINT/SIGTERM/SIGHUP passed on. On Windows only `.cmd`/`.bat` targets go through a shell.
  - A protected environment the role cannot use (developer on `production`) prints `❌ "production" is protected; only project admins can read it.`; viewers and tokens limited to other environments print the API's message.
- **`aoox registry build <name:version> --push`** builds and then pushes in one step (the same login and push as `aoox registry push`; the version is checked against the registry once, before the build). Without `--push`, the closing hint now also mentions it.
- **Plain `aoox` shows the IP address and the panel domain side by side** once a panel domain is set, e.g. `Dashboard  http://203.0.113.7:3000 - dashboard.example.com`, the same for the API and the self-hosted registry (`http://203.0.113.7:5000 - registry.example.com (self-hosted)`). The domains come from the dashboard's discovery file; when you signed in with a domain, the IP comes from DNS and is shown only after it answers as aoox (or as a Docker registry), so a CDN or proxy address never appears. Each lookup is limited to 1.5 s and runs alongside the registry check.

### Fixed

- **A clear message when Docker is not running.** `aoox registry build`, `aoox registry push` and `aoox deploy` first check the local Docker engine (`docker version`) and stop with `❌ Cannot connect to the Docker engine.` plus "Start Docker Desktop (or the Docker service, e.g. `sudo systemctl start docker`), then try again." (or that Docker is not installed), instead of docker's raw `failed to connect to the docker API at npipe:…` and `DockerCommandError`. `push` no longer reports "No local image" just because the engine is down.
- **Error lines use a red ❌ instead of ✖.** Some terminals (Windows Terminal) draw ✖ as a wide emoji over the following space, so `aoox registry build|push` and `aoox update` errors read `✖A version…`; ❌ is always given two columns.
- **Plain `aoox` no longer shows the API address as the dashboard.** A login saved before 0.1.0-alpha.8 (or made with the API address) has no dashboard address; the connection summary now says `Dashboard  unknown (sign in again with the dashboard address: aoox login)` instead of repeating the API address (e.g. `:3001`). It also first tries to find the dashboard on port 3000 of the API host, so an old login usually shows the right address without signing in again.

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

[Unreleased]: https://github.com/hideandseeklab/aoox-cli/compare/v0.1.0-alpha.11...HEAD
[0.1.0-alpha.11]: https://github.com/hideandseeklab/aoox-cli/compare/v0.1.0-alpha.10...v0.1.0-alpha.11
[0.1.0-alpha.10]: https://github.com/hideandseeklab/aoox-cli/compare/v0.1.0-alpha.9...v0.1.0-alpha.10
[0.1.0-alpha.9]: https://github.com/hideandseeklab/aoox-cli/compare/v0.1.0-alpha.8...v0.1.0-alpha.9
[0.1.0-alpha.8]: https://github.com/hideandseeklab/aoox-cli/compare/v0.1.0-alpha.7...v0.1.0-alpha.8
[0.1.0-alpha.7]: https://github.com/hideandseeklab/aoox-cli/compare/v0.1.0-alpha.6...v0.1.0-alpha.7
[0.1.0-alpha.5]: https://github.com/hideandseeklab/aoox-cli/compare/v0.1.0-alpha.4...v0.1.0-alpha.5
[0.1.0-alpha.4]: https://github.com/hideandseeklab/aoox-cli/compare/v0.1.0-alpha.3...v0.1.0-alpha.4
[0.1.0-alpha.3]: https://github.com/hideandseeklab/aoox-cli/compare/v0.1.0-alpha.2...v0.1.0-alpha.3
[0.1.0-alpha.2]: https://github.com/hideandseeklab/aoox-cli/compare/v0.1.0-alpha.1...v0.1.0-alpha.2
[0.1.0-alpha.1]: https://github.com/hideandseeklab/aoox-cli/compare/v0.1.0-alpha.0...v0.1.0-alpha.1
[0.1.0-alpha.0]: https://github.com/hideandseeklab/aoox-cli/releases/tag/v0.1.0-alpha.0
