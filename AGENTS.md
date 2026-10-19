# aoox-cli

## Language

- Write everything in this repository in English: AGENTS.md, README, CONTRIBUTING, CHANGELOG, code comments and commit messages. Existing Indonesian text is being translated gradually; do not add new Indonesian text.

CLI (`aoox`) for aoox — installed on the developer's laptop, not on a server. Its main job:
build the image locally, push it to the aoox registry, then trigger a deploy through the panel API
(`../aoox-api`). The web panel lives in `../aoox-web`.

## Commands

- `npm run build` — `tsc -b` to `dist/`
- `npm test` — mocha (`posttest` automatically runs `npm run lint`)
- `npm run lint` — eslint (`eslint-config-oclif`)
- `./bin/dev.js <command>` — run from TypeScript without a build (ts-node/esm)
- `./bin/run.js <command>` — run the built output in `dist/`

## Git

- Do not commit or push unless explicitly instructed to by the user.

## Structure

- `src/commands/<name>.ts` — one file = one command (`export default class extends Command`).
  The file name determines the command name; subfolders become topics. Do not register manually anywhere:
  `oclif.commands` in `package.json` points to `./dist/commands`.
- `src/lib/` — everything that is not a command (config, API client, types, shared flags).
- `test/**/*.test.ts` — mocha + chai. Pure helpers are tested directly. Commands that touch the network can be tested
  against a fake panel by replacing `globalThis.fetch` for the test and running them with `@oclif/test` `runCommand`
  (pattern: `test/commands/env.test.ts`); most older commands are not tested that way yet.

## ESM

`"type": "module"` with `module`/`moduleResolution` = `Node16`. Consequence: **all relative imports
must have a `.js` extension** even though the file is `.ts` (`import {api} from '../lib/api.js'`).
A mistake here only surfaces at runtime, not during `tsc`.

## Executable name

One canonical name: `aoox`.

- `bin` (npm): one entry, `{"aoox": "./bin/run.js"}`. This is what npm creates on `npm i -g`;
  a name not registered here will not exist.
- `oclif.bin`: `aoox` — used for help text (`$ aoox …`), the env var prefix, and the
  default folder name.
- `oclif.dirname`: `aoox` → `this.config.configDir` = `%LOCALAPPDATA%\aoox` (Windows) or
  `~/.config/aoox`. If not set, it follows `oclif.bin`.

## Configuration & credentials

- `aoox login` stores `{url, webUrl?, token}` in `<configDir>/config.json` with mode `0600`
  (`chmod` follows `writeFile` because `mode` only applies when the file is created; failure on Windows is ignored).
- Token = **platform API token** (`aoox_…`, created in the panel under Settings → Account), not a session JWT.
  It acts as its owner user and is re-read from the DB on every request on the API side.
- The `--url`/`--token` flags are in `src/lib/flags.ts` and carry oclif `env:`
  (`AOOX_URL`, `AOOX_TOKEN`), so CI does not need `aoox login` and the fallback
  still shows in `--help`.
- `resolveCredentials()` (pure, unit-tested): flag/env wins per field, **except** that a
  stored token is never sent to another panel — `--url` pointing to a different host without `--token` is rejected,
  so credentials do not leak to the wrong host.
- **`url` in config = the API base URL (what requests go to); `webUrl` = the dashboard address the user typed** (absent in files from before discovery — those keep working because their `url` already is the API).
  **The user only types the dashboard address.** `src/lib/discovery.ts` (`discover()`, pure parts unit-tested with a fake fetch): `candidateUrls()` (no scheme → https then http; a bare IP/`localhost` without a port also `http://…:3000`),
  then `GET <web>/.well-known/aoox.json` (aoox-web, `{apiUrl, webUrl, version}`) → `apiUrl`. If the file is missing but `<url>/auth/setup-status` answers JSON, the address is an API URL (older script/config): accepted with a one-line note.
  A loopback `apiUrl` (PUBLIC_API_URL not configured) while the dashboard was reached on a real host → `http://<that host>:3001` + a note. Failures become human messages (`classifyFetchError`/`explainFailure`, also used by `api()` for transport errors):
  plain HTTP behind https (Node reports `ERR_SSL_WRONG_VERSION_NUMBER` or `ECONNRESET … before secure TLS connection was established`), timeout/unreachable (firewall, "Infrastructure → Panel domain"), not an aoox dashboard, TLS certificate. Never print the token.
  `--url`/`AOOX_URL` (and the `.aoox.json` url used by `deploy`) go through `resolveApiUrl()` in `flags.ts`: an address equal to the stored `url`/`webUrl` maps to the stored API URL with no network call, anything else is discovered; the result then goes through `resolveCredentials()` (host matching unchanged, on the **API** URL).
  `aoox link` still writes the API URL into `.aoox.json` (works with older CLIs too).
- **Version warning** (`src/lib/outdated.ts`, `version.ts` semver incl. pre-release): `GET /auth/me` already returns the API `version`; `login`/`whoami` reuse that response, `link`/`deploy`/`update`/`domain set`/`domain clear`/`registry domain` make one extra best-effort call (3 s timeout, errors swallowed) and `warn()` once when the CLI is older. Never fails a command.
- **Image name/version from the project** (`aoox registry build|push`, `src/lib/image-source.ts` + `manifest-parsers.ts` + `image-confirm.ts`): `name:version` typed in full wins and reads nothing; a bare name or no argument is completed from the build context (push: cwd), first source that has each value: `package.json`, `pyproject.toml`, `Cargo.toml`, `composer.json`, `pubspec.yaml`, one `*.csproj`, `pom.xml`, then a `VERSION` file, then the git tag HEAD is exactly on (version), then the folder name (name). Name and version may come from different sources; both origins are printed. Names are lowercased (scope/vendor removed), `+` in a version becomes `_`, unreadable values (`$(...)`, `${...}`, workspace, dynamic) count as missing; HEAD past a tag is refused unless `--force` (then the `git describe` form is used). No TOML/YAML/XML dependency on purpose: only a few top-level values are read by small pure parsers. The resolver is pure over a `SourceEnv` (files, read, git) so tests fake it. Derived values are confirmed before anything else (`confirmDerived`: Y/n/e, `--yes`/`-y`, non-TTY or `CI` set = refuse and ask for `name:version` or `--yes`, same rule as the `env` commands); `build --push` asks once because `resolveImage` runs once. The "already exists" refusal names where to bump the version (`bumpHint`).
- **Output style** (`src/lib/style.ts`): every command prints progress through `stepLine` (`==> label value`), `successLine` (green, `✓` only when colour is on), `hintLine` (dim secondary info) and `warnLine` (yellow `warn` label, written to stderr; use `this.logToStderr(warnLine(...))` instead of `this.warn`) next to the existing `errorLine`. New commands must use them rather than a bare `this.log('==> ...')`. Colour follows the stream (stdout/stderr TTY), `NO_COLOR`, `FORCE_COLOR`, `TERM=dumb`; plain output keeps the old text, so tests assert plain strings. Never colour docker/compose child output or machine-readable output (`env pull` stdout, `--json`).
- By default the token is not requested as an argument: `aoox login` prompts with masking
  (`@inquirer/prompts`), because a token on the command line ends up in shell history and the process list.
  Without a TTY (CI) the command refuses and tells you to use the flag/env.

## API client (`src/lib/api.ts`)

- Global `fetch` (Node ≥ 22; `engines` was raised to 22 because the lint rule `n/no-unsupported-features`
  is correct: `fetch`/`Response` only became stable in Node 21).
- `connection: close` header: one CLI run makes only 1–2 requests, so keep-alive is useless —
  the server may close its socket early. This is **not** the Windows crash patch below
  (initially thought to be, but it only covers the 1-request case; see `windows-exit-fix.ts`
  for the actual patch).
- NestJS error body `{statusCode, error, message}` is extracted by `messageFromBody()` (pure, unit-tested);
  `message` can be an array when `ValidationPipe` rejects a DTO.
- `ApiError.status === 0` means the panel was unreachable (DNS/refused/TLS/timeout), not an HTTP reply.

## Windows crash: `process.exit()` after ≥2 `fetch()` (`src/lib/windows-exit-fix.ts`)

- **Symptom**: on Windows, every time an oclif command **fails** (touching `this.error()`/`this.exit()`
  after **two or more** `fetch()` calls have completed), Node crashes: `Assertion failed:
  !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c, line 94`, and the original exit code (e.g. 2)
  is replaced by **127**. Proven through isolation (`probe*.mjs` in the scratchpad, without oclif at all):
  it is not about keep-alive sockets (neither the `connection: close` header nor an explicit `getGlobalDispatcher().close()`
  **helps** beyond 1 request), and not about the event-loop tick (`setImmediate`
  is not enough) — only a **natural exit** (empty loop without an explicit `process.exit()`) is always clean;
  a fixed delay (`setTimeout`) only "helps" above ±100 ms, which is not worth trusting or paying on every error.
  This is a libuv/undici Windows race bug in socket teardown, beyond userland control —
  **not** a bug in this CLI's code.
- **Why this matters for this CLI**: `@oclif/core`'s `errors/handle.js` calls `process.exit()`
  on **every** errored command (including all `this.error()`/`this.exit()` here) — so every
  command that fails after ≥2 requests (e.g. `aoox link` with a wrong `--app`: `GET /projects` then
  `GET /applications?projectId=`) is hit.
- **Patch** (`applyWindowsExitFix()`, installed as early as possible in `bin/run.js` **and** `bin/dev.js`,
  before any `execute()`/`fetch()`): on Windows only, it replaces `process.exit` with a version that
  only sets `process.exitCode` and then **returns** (does not actually exit) — Node then exits
  on its own once the event loop is empty, which in practice is immediate. Tested with a fake `proc` object
  (`ExitLike`, `test/lib/windows-exit-fix.test.ts`) so there is no need to mutate the real `process`
  inside the mocha test process itself.
- **Accepted trade-off**: the SIGINT branch in `handle.js` calls `process.exit(1)` and then **keeps
  running** (printing the error) until its own final `process.exit()` at the end of the function — with
  this patch, that continuation becomes observable (it no longer stops immediately). This is not a problem for
  the commands that exist now (none depends on synchronous Ctrl+C); revisit if `aoox logs`/`aoox
  deploy` streaming later needs it.

## oclif v4 notes

- **Ctrl+C at a prompt** (`src/lib/interrupt.ts`): `bin/run.js` and `bin/dev.js` call `executeCli()` (oclif's `execute` with one extra catch) instead of `execute`. An `ExitPromptError` (inquirer, and the readline `askChoice` in `image-confirm.ts`, which throws the same error name) prints `Aborted.` to stderr and exits **130**; every other error goes to oclif's `handle` as before. Commands must not catch `ExitPromptError` themselves. Do not use `execute` directly in a bin file.
- **Test temp dirs**: any test that creates a folder under `os.tmpdir()` (`mkdtemp*`, prefix `aoox-…`) removes it in `afterEach`/`after` or `try/finally` with `rm(dir, {force: true, recursive: true})`.
- `@oclif/core` v4 **has no `ux.prompt`** (only `action`, `colorize`, `error`, `exit`,
  `stderr`, `stdout`, `warn`) — prompts use `@inquirer/prompts`.
- `static enableJsonFlag = true` → the value `return`ed from `run()` is printed as JSON when
  `--json` is used, and `this.log` is automatically muted, so the JSON output stays valid.
- `this.error(msg, {suggestions})` exits with code 2 and prints "Try this".

## Types from the API

There is no shared package. Response types are copied by hand into `src/lib/types.ts` — the same pattern
as the web app (`src/features/**/*.entity.ts`). Every addition must be matched against the DTO in
`aoox-api`.

## Status & plans

Already available: `aoox login`, `aoox whoami`, `aoox link`, `aoox deploy`, `aoox env …` / `aoox run` (variable sets), `aoox install`, `aoox update` / `aoox update panel`, `aoox registry build|push|domain`.
Next: `aoox logs` (Socket.IO `/logs` + 60-second ticket, its protocol mirrored from the API) — `aoox
deploy` now already follows the deployment log itself via polling, so the Socket.IO-based `aoox logs` above is
only needed for live container logs outside the context of a single deploy.

## TLS trust (`src/lib/system-ca.ts`, `peekIssuer`/`describeNetworkError` in `discovery.ts`)

- **Why**: antivirus HTTPS scanning (AVG Web/Mail Shield, Avast, Kaspersky, ESET, Bitdefender) and corporate proxies re-sign HTTPS with a root that lives in the OS store only; Node trusts its bundled Mozilla list, so every request failed with UNABLE_TO_GET_ISSUER_CERT_LOCALLY.
- **`applySystemCa()`** runs in `bin/run.js` and `bin/dev.js` right after `applyWindowsExitFix()` (before any fetch): `tls.setDefaultCACertificates([...new Set([...getCACertificates('default'), ...getCACertificates('system')])])`. `'default'` already contains `NODE_EXTRA_CA_CERTS`, so that keeps working. Requires Node 22.19+ / 24.5+ for `setDefaultCACertificates` (`getCACertificates`: 22.15+ / 23.10+); on older Node, or when loading throws, it is a silent no-op (the pure function takes an injectable `api`, tested in `test/lib/system-ca.test.ts`). Opt-out `AOOX_SYSTEM_CA=0|false`. Verified for real that global `fetch` (undici) uses the merged list: with `NODE_EXTRA_CA_CERTS`/`NODE_USE_SYSTEM_CA` unset, `discover()` against a host behind AVG fails without the call and succeeds with it. Gotcha for testing on a machine with AVG: AVG sets `NODE_EXTRA_CA_CERTS` (and the user may have `NODE_USE_SYSTEM_CA=1`) in the environment — unset both, or the failure never reproduces; AVG also intercepts loopback TLS, so a throwaway local CA server cannot be used.
- **Error message**: `describeNetworkError()` (async; used by `api()` and `discover()`) for UNABLE_TO_GET_ISSUER_CERT_LOCALLY / UNABLE_TO_VERIFY_LEAF_SIGNATURE / SELF_SIGNED_CERT_IN_CHAIN calls `peekIssuer()` once: a `tls.connect` with `rejectUnauthorized: false` that only reads `getPeerCertificate().issuer`, never writes, 3 s timeout, destroyed immediately. That is the **only** place verification is off; there is no skip-verification option and `NODE_TLS_REJECT_UNAUTHORIZED` is not used. Expired / self-signed leaf / wrong-name keep the old wording. The sync `explainNetworkError` remains for callers without a lookup.

## `aoox install` (`src/commands/install.ts`, `src/lib/{install-env,system}.ts`, `assets/install/`)

Bootstraps aoox on a **new** VPS via Docker Compose — run **on the VPS itself**
(`sudo aoox install`), not from the laptop over SSH (that option was proposed and then rejected by the user — simpler & standard
like other self-hosted PaaS installers, with no need for the CLI to carry its own SSH client logic).
- **The compose file and `.env.dist.example` are bundled inside the CLI package** (`assets/install/`), **not**
  `curl`ed from `aoox-api` during installation — tried first (`curl .../-/raw/main/...`), the repo is
  **private** and an anonymous fetch returns 302 to the GitLab login page. So there is zero network dependency on the
  private repo during installation (fewer things that can fail, works even when GitLab is down); **the consequence:
  that file must be synced by hand** whenever `docker-compose.dist.yml`/`docker-compose.domain.yml` in
  `aoox-api` changes — recorded in `assets/install/README.md`. Path resolution uses
  `import.meta.url` (`../../assets/install/` from the command file) — the same relative depth from
  `dist/commands/install.js` (prod) and `src/commands/install.ts` (`bin/dev.js`), verified that
  both resolve to the same folder.
- `buildEnvFile()` (`install-env.ts`, pure, unit-tested) writes a **brand-new** `.env.dist` from scratch
  (not a template-fill of the commented example file — fragile to keep in sync with prose), with the same keys the compose file reads. **There is a drift regression test** (`install-env-coverage.test.ts`): it reads every `${VAR}` that both bundled compose files reference and requires `buildEnvFile`
  to write all of them (except `API_IMAGE`/`WEB_IMAGE`/`JWT_EXPIRES_IN`, which deliberately have defaults at the
  compose level and are not written) — this test is what caught `COOKIE_SECURE` being initially forgotten.
  Secrets (`POSTGRES_PASSWORD`, `JWT_SECRET`, `ENCRYPTION_KEY`) come from `crypto.randomBytes`.
  `PUBLIC_IP`/`WEB_ORIGIN`/`PUBLIC_API_URL` come from the detected public IP (`detectPublicIp()`,
  `https://api.ipify.org` — the same service trusted by `check-domain-dns` in the API) except in domain mode
  (`--web-domain`+`--api-domain`, **requires** `--acme-email` — without it the `le` resolver
  referenced by the `docker-compose.domain.yml` labels never exists, and https fails silently).
  `TERMINAL_SSH_HOST` is always `host.docker.internal` (compose already provides this alias via
  `extra_hosts`), and `TERMINAL_SSH_USER` for a NEW install = **the human user who ran sudo**
  (`SUDO_USER`, `resolveTerminalSshUser()`/`defaultTerminalSshUser()` in `install-env.ts`, pure & tested),
  `root` when there is no `SUDO_USER`, `SUDO_USER=root`, or the value is not a plain login name; an explicit `--terminal-ssh-user`
  always wins. Previously the default was always `root`, even though cloud images (Ubuntu/Tencent) usually disable
  SSH login for root (`PermitRootLogin`) and root has no `authorized_keys` — Terminal failed with "SSH authentication
  failed for root@host.docker.internal" for people who had just installed. `buildEnvFile` itself still defaults to
  `root` when `terminalSshUser` is empty: that is what `aoox reinstall` (`defaults()`) uses to add missing keys,
  and `mergeEnv` never overwrites existing values — old installs are unchanged.
  The platform key is now also prepared automatically (see **Terminal key** below); if that step is skipped/fails,
  the fallback is the "authorize" button in Settings → Terminal (`POST /terminal/authorize` in the API) or the manual authorization command shown there.
- **Terminal key** (`src/lib/terminal-key.ts`, called by `install.ts#authorizeTerminal` right after `.env.dist` is written; `aoox reinstall` does NOT touch it).
  **Behavior spec — install.sh in aoox-landing must be identical** (order, names, permissions, comments):
  1. Skip (silently, except for the opt-out) when: `--no-terminal-authorize`; not Linux; not root; `TERMINAL_SSH_PRIVATE_KEY_FILE`/`TERMINAL_SSH_PASSWORD` is set; `TERMINAL_SSH_USER` is empty/not a plain login name (`^[a-z_][\w-]{0,31}$`).
  2. `<dir>/secrets` is created (`mkdir -p`), `chown 1000:1000` (the `node` user in the api container), `chmod 700`.
  3. If `<dir>/secrets/terminal_ssh_key` does not exist yet: `ssh-keygen -q -t ed25519 -N "" -C aoox-terminal -f <dir>/secrets/terminal_ssh_key` (OpenSSH format), then the private key `600`, `.pub` `644`, both `chown 1000:1000`. An existing key is not replaced.
  4. The public key line = the first non-empty line of `terminal_ssh_key.pub`, must be one line `ssh-<tipe> <base64> [comment]`.
  5. The `TERMINAL_SSH_USER` account from `getent passwd` (fallback `/etc/passwd`): uid, gid, home; home must be absolute, not `/`, without `..`.
  6. `~/.ssh` (`mkdir -p`, `chmod 700`) and `~/.ssh/authorized_keys` (created if needed, `chmod 600`); the key line is appended only if no line that is **exactly the same** exists (add a newline if the file does not end with one, key on its own line); `chown uid:gid` for `.ssh` and `authorized_keys` (not recursive). Refuses (error) if `.ssh` or `authorized_keys` is a symlink — runs as root, so do not follow a link owned by the user.
  7. Never fails the installation: any error → warning `terminal key not authorized automatically; use Settings > Terminal > authorize (<alasan>)`; success → `terminal key authorized for <user>` / `already authorized for <user>`.
  Compatibility was tested for real (node:22-bookworm, genuine OpenSSH ssh-keygen): `ssh2` `utils.parseKey` in the API reads the key produced by `ssh-keygen`, and the API's `publicKeyLine()` derives a line **exactly identical** to `.pub` (the `aoox-terminal` comment included). Pure logic (paths, keygen arguments, permissions, line, idempotency, symlinks) is in `test/lib/terminal-key.test.ts` with a temporary file system (permission/owner cases are skipped on Windows). Not yet tested: a Linux host with a real sshd.
- `system.ts` (mostly impure — exec/spawn, not unit-tested except the pure `isIpv4`):
  `isRoot()` (`process.getuid()`, required — writes to `/opt` + manages Docker), `commandExists`/
  `dockerRunning` (`docker info`), `dockerSocketGid()` (`stat -c %g /var/run/docker.sock` — used for
  `DOCKER_GID` in compose; a gotcha that used to be documented manually is now automatic), `runShellInherit`
  (used for `curl -fsSL https://get.docker.com | sh` — **only after confirmation**, unless
  `--yes`; the Docker installation itself is system-wide, not a silent action).
- The `run()` flow: platform must be Linux + root → (Docker not yet installed/running? offer to install) → confirm
  the plan (`--force` to overwrite an existing `--dir`, `--yes` skips all prompts) → copy the
  bundled compose to `--dir` → `chown 1000:1000 <dir>/secrets` (the EACCES gotcha for the terminal SSH key that was
  documented in the compose comment — now automatic) → `.env.dist` → `docker compose … up -d`
  (via the same `dockerInherit` as `aoox deploy`) → poll `GET localhost:3001/auth/setup-status`
  until the API is really ready (migrations run on boot, "container up" ≠ "ready") → print the URL + `/setup`
  info (unless `--admin-email` is set, non-interactive).
- **Verified**: asset path resolution (dist & dev mode, both really exist on disk), env coverage drift test
  against the bundled compose, precondition gate (not Linux → clear error, `--api-domain`
  without `--web-domain` → rejected by oclif's own `dependsOn` before this code runs at all; both
  exit 2 cleanly, not a Windows crash because it happens before any `fetch`). **Not yet tested live**
  on a real Linux VPS (not available in this session) — `docker compose up -d`, the automatic
  Docker installation, and polling `/setup-status` rely on `dockerInherit`/`fetch` that have been proven in
  `aoox deploy`, but the full orchestration path of `install.ts` itself has not yet been tried end-to-end for real.

## `aoox deploy` (`src/commands/deploy.ts`, `src/lib/{docker,git,image-ref}.ts`)

Build & push run **on the laptop**, not on the server (the reason this CLI exists) — the API only receives
the result through the existing `sourceType: 'image'` path:
1. `readLink(cwd)` → `aoox link` must already have been run. `loadCredentials(..., link.url)` — the token from
   `aoox login` is used only if its host matches the link (the `resolveCredentials` rule).
2. `GET /applications/:id` (not from the link file's cache) for `appName`, `project.name`, and the current
   sourceType/imageRegistryId — **unlike the list**: only `get-application` includes a nested
   `project`; `list-applications` does not (verified via curl).
3. Choose the registry: an explicit `--registry <id>`, otherwise **default to the `self-hosted` registry**
   (`RegistryDto.type`) — this default is my own choice because the local registry was built for exactly this; external registries / several registries without a self-hosted one → a `select` prompt
   (or an error asking for `--registry` without a TTY). `GET /registries/:id/credentials` (the newer API flow,
   see AGENTS.md of aoox-api) for `docker login`.
4. Tag = `--tag`, or `deployTag(cwd)` (`git.ts`): `git rev-parse --short HEAD` + `-dirty` if
   `git status --porcelain` is not empty (including untracked files such as `.aoox.json` that was just
   written by `aoox link` — **tested for real**; that is exactly what proves dirty detection works), or an ISO
   timestamp if it is not a git repo. `sanitizeTag()` (pure, unit-tested) ensures the result is
   valid for **both**: the Docker tag rules (no `:`) **and** the API's `imageRef` DTO regex,
   which rejects uppercase letters anywhere (not just in the tag) — the ISO timestamp (`T`/`Z`) must be lowercased.
5. `imageRefFor()` (`image-ref.ts`, pure, unit-tested) **mirrors exactly** `slugPart()` in the API's
   `deployment-runner.service.ts` (`<registry.url>/<slug(project.name)>/<appName>:<tag>`) —
   so an image built on the laptop lands at the same path as if the API itself had built it.
6. `docker build`/`docker push` via `dockerInherit()` (`docker.ts`, `spawn` with `stdio:'inherit'`
   — docker's own output is already readable, no need to wrap it). `docker login` via
   `dockerLogin()` — the password goes through **stdin** (`--password-stdin`), not argv (so it does not appear in the process list/history). A registry without username/password (public registry) → the login step is skipped.
7. `PATCH /applications/:id {sourceType:'image', imageRef, imageRegistryId}` then
   `POST /:id/deploy` — this is what makes the API **pull back** the image the CLI just pushed
   (`pullSourceImage()`, authenticated automatically from the same `imageRegistryId`) and then replace
   its container; an existing, already-tested path, with no new code in the API for CLI-specific builds.
8. `follow()` polls `GET /deployments/:id` every 1.5 seconds, printing the new `logs` chunks
   (not from Socket.IO — enough for a single deploy, with no new dependency), and stops at
   `success`/`failed` (exit 1 + `errorMessage` on failure). Recursion, not `for(;;)`, so the lint rule
   `no-await-in-loop` (which targets accidentally sequential awaits) does not fire for polling that is
   deliberately sequential.
- **Tested for real, end to end**: a throwaway `sourceType:image` app in the project "Smoke Test" (created via
  curl because `aoox link` v1 cannot create new applications), a small git repo with an nginx Dockerfile,
  `aoox link` → `aoox deploy` with no flags → build (base image pulled, layers cached by
  BuildKit) → `docker login localhost:5000` succeeded → push (one layer "Mounted from" — registry dedup
  works) → the API pulls again with the same credentials → container `Up`, `GET
  /applications/:id` reports `status:"running"` and `currentImage` = the exact image that the
  CLI pushed. `--registry <wrong id>` fails fast (before any docker build is touched, exit 2,
  not a crash). All test artifacts were cleaned up (app deleted, registry tag deleted + GC, local image
  deleted).

## `aoox link` (`src/lib/link.ts`, `src/commands/link.ts`)

- Writes `.aoox.json` at the **current repo root** (not the oclif config dir — this is per repo, not
  per machine): `{url, projectId, projectName, applicationId, applicationName}`. Safe to commit —
  it contains only ids/names, no token — so every contributor to the repo is automatically connected to the
  same application without having to link manually each time.
  `readLink()`/`writeLink()`/`linkPath()` mirror `config.ts` (plain Node fs, no new dependencies).
  `url` is stored too (not just the id) so that later `aoox deploy`/`aoox logs` can go through the same
  `resolveCredentials()` as the `--url` flag — a stored token is not sent to a panel other than the one this link was created for.
- **v1 only selects from existing applications** (`GET /applications?projectId=`) — it cannot
  create a new application from the CLI (that needs many fields: git/image source, ports, etc., outside the
  scope of "link"). An empty project/application → the error message tells you to create one in the panel first.
- `--project <id>`/`--app <id>` skip interactive selection (`@inquirer/prompts` `select()`) —
  used for CI/scripting; without a TTY and without flags → a clear error, not hanging while waiting for input.

## `aoox update` (CLI) vs `aoox update panel`

- `src/commands/update.ts` = **the CLI updates itself** (breaking change of meaning); `src/commands/update/panel.ts` = the old panel update, unchanged (`GET /instance/update`, `--apply` → `POST /instance/update/apply`).
  oclif v4 happily has the command `update` and the topic/command `update panel` side by side (`topicSeparator: " "`, `oclif.topics.update` gives the topic a description) — verified: `aoox update`, `aoox update panel`, `aoox update --help`.
- Self-update (`src/lib/self-update.ts`, pure parts tested with fake documents/fetch): `GET https://registry.npmjs.org/@hideandseeklab%2faoox` (abbreviated packument; `AOOX_NPM_REGISTRY` overrides the base for tests/mirrors) → `pickNewest(doc, installed)`:
  candidates are `dist-tags.latest` plus the installed version's own channel tag (`alpha`); a stable install drops every pre-release; versions missing from `versions` or `deprecated` are skipped; semver incl. pre-release via `version.ts`.
  `detectInstallMethod({root, hasBundledNode})`: `bin/node`(`.exe`) inside `this.config.root` → **standalone** tarball (print `curl -fsSL https://aoox.dev/install-cli.sh | AOOX_VERSION=<v> sh`; no `@oclif/plugin-update` dependency on purpose);
  `<prefix>/lib/node_modules/@hideandseeklab/aoox` (or a Windows drive path ending `…/node_modules/@hideandseeklab/aoox` with no other `node_modules`/`_npx` above it) → **npm-global**: run `npm i -g @hideandseeklab/aoox@<exact version>` (inherited stdio, `shell: true` only on Windows for `npm.cmd`); anything else (source checkout, npx cache, local dependency) → **other**: print the npm command and change nothing.
  `--check` only reports. Network failure → `❌ Could not reach the npm registry (...)`, exit 1. `aoox update --apply` (hidden flag) prints `Panel updates moved to: aoox update panel --apply` and exits 1 without touching anything.
- npm dist-tags: `.github/workflows/npm-publish.yml` publishes an alpha under `--tag latest` (npm requires the explicit tag for a pre-release); `latest` is the only tag in use. There is no `alpha` tag any more (removed 2026-10-12): Trusted Publishing authorizes `npm publish` only, so a second tag could not be moved and went stale (alpha.8 shipped with `alpha` still on alpha.7). `pickNewest` still reads a channel tag if one exists, so an old one never blocks `aoox update`.
  First install hint everywhere: `npm i -g @hideandseeklab/aoox`; upgrade hint: `aoox update`.

## `aoox registry password` (`src/commands/registry/password.ts`)

- `--show` prints address, username and password from `GET /registries/:id/credentials` (owner/admin; the GET is not audit-logged, unlike the dashboard's reveal POST); `--reset` calls `POST /registries/self-hosted/password` (owner) and requires `--yes` because every client has to `docker login` again; images are untouched. The bundled compose copy gained `REGISTRY_PUBLISH_ADDRESS`, `TZ` and `REGISTRY_INTERNAL_URL=http://aoox-registry:5000`; `install-env-coverage`/`reinstall` tests list the two optional variables as intentionally omitted. `install-env.ts` already writes the detected `PUBLIC_IP` (used for the registry's external address once exposed), so no install change was needed. The README's command list is oclif-generated: run `npx oclif readme` at release time.

## `aoox registry build` / `push` (`src/commands/registry/{build,push}.ts`, `src/lib/{registry-image-command,registry-check,registry-select}.ts`, `image-ref.ts`)

- Both extend `RegistryImageCommand` (abstract, in `lib/`; oclif only scans `dist/commands`): parse `[host/]name:version` with `parseImageName()` (lowercase repo path components, tag `\w[\w.-]{0,127}`, no digests; bare name → `❌ A version is required` + example), pick the registry with `chooseRegistry()`
  (explicit `--registry`, else for a full name the registry whose host matches, else self-hosted, else the only one, else prompt/`--registry`; `aoox deploy` uses the same function), `GET /registries/:id/credentials`, name = `<host>/<imagePrefix?>/<name>:<version>` (`registryHost()` strips the scheme).
- **Existence check** (`registry-check.ts`): `HEAD /v2/<repo>/manifests/<tag>` with the manifest/index Accept types; 200 exists, 404 free; sends Basic upfront and on 401 + `WWW-Authenticate: Bearer` fetches a token (realm+service+scope, Basic credentials if any) and retries; still 401 / non-Bearer 401 → `RegistryCheckError("the registry rejected the credentials")`.
  Base URLs mirror the API (`registryBaseUrls`): explicit scheme wins, self-hosted without domain = http, external = https; loopback/bare-IP hosts also try the other scheme. A failed check aborts with `Add --force to skip this check`. `--force` or tag `latest` skips the check entirely.
  Exists → `❌ <name>:<version> already exists in <host>.` + `Pick a new version (e.g. <name>:<bumped>), or add --force to overwrite it.` (`suggestNextVersion()` bumps the last number of versions that start with `v?<digit>`; no suggestion otherwise). Failures print to stderr and exit 1.
- Docker engine check: `build`, `push` (before its local-image check) and `deploy` call `dockerEngineStatus()` (`lib/docker.ts`, `docker version --format {{.Server.Version}}`, 10 s; ENOENT → `missing`, non-zero/timeout → `unreachable`) and stop with `dockerUnavailableLines()` ("Cannot connect to the Docker engine." + start Docker Desktop / `sudo systemctl start docker`) instead of docker's raw npipe/socket error.
- `build` runs `docker build -t <full> -f <dockerfile> <context>`; with `--push` it then calls the shared `pushImage()` (login + push, same as `push`; no second existence check), otherwise it prints `Next: aoox registry push <name:version> (or build with --push next time)`. `push` first runs `docker image inspect` (missing → `❌ No local image …` + `Build it first: aoox registry build …`), then the existence check, `dockerLogin` (stdin password), `docker push`, and prints `Use it in the dashboard: New application → Ready-made image`.
  A `localhost:…` registry with a remote panel prints a warning (`localhostRegistryHint`, also in `deploy`). Tested for real against `registry:3` with htpasswd auth (build ok / exists / `--force` / `latest` / push ok / no local image / bare name / full name for another host) behind an isolated API.

## Root help: connection block (`src/help.ts`, `src/lib/connection-summary.ts`)

- `oclif.helpClass` = `./dist/help` (a `Help` subclass overriding `showRootHelp`). Only when `process.argv` has no arguments (plain `aoox`) it appends `formatConnection()`; `aoox --help` and `aoox <cmd> --help` are stock.
  Dashboard and API lines come from `lib/panel-addresses.ts` `resolvePanelAddresses()` (fetch + DNS injectable, tested): candidates = stored `webUrl`/`url` plus the `apiUrl`/`webUrl` the dashboard's `/.well-known/aoox.json` advertises; each endpoint shows `<IP url> - <domain host>` (loopback ignored). Only a domain known → `dns.lookup` the domain and show `http://<ip>:3000`/`:3001` only after that address answers as aoox (discovery file / `GET /` `description: 'aoox api'`), so a CDN address never shows; no stored `webUrl` → the dashboard is probed on port 3000 of the API host; still nothing → `unknown (sign in again with the dashboard address: aoox login)`, never the API url. Self-hosted registry: `GET /registries/self-hosted` → port from `publicUrl` → `resolveRegistryIp()` shows `http://<server ip>:<port>` only when `/v2/` returns the `Docker-Distribution-Api-Version` header. Every request ≤1.5 s, run alongside the registries call; Registry = one `GET /registries` with a 2 s timeout via `chooseRegistry()` (never throws; `(could not check: panel unreachable|token no longer valid|HTTP n)`), `localhost` registry → "(only reachable on the server — set a domain …)". No config → `Not connected — run: aoox login`. The token is never printed.

## CI

`.github/workflows/npm-publish.yml`: every `git push --follow-tags` creates a `v*` tag that triggers
build + `npm test` + `npm publish`; the npm dist-tag is derived from the version's pre-release label
(an alpha publishes under `latest` only, other pre-releases under their own label, `1.0.0` under `latest` — see the `aoox update` section) — see `RELEASING.md`. Authentication
goes through **npm Trusted Publishing (OIDC)** — `permissions.id-token: write` in the workflow, with no token
stored at all (granular npm tokens with direct publish access are being deprecated as of
Jan 2027). A new trusted publisher can only be registered on npmjs.com **after** the `aoox` package exists,
so the first publish stays manual from a dev machine (normal 2FA) — the full sequence is in
`RELEASING.md`. `npm publish` triggers the `prepack` hook = `oclif manifest && oclif readme`, so **the README
is regenerated automatically** from the command list — do not edit the part between the
`<!-- commands -->` markers manually. There is still no CI for ordinary PRs/pushes (it only runs when a release tag is pushed) —
`npm run lint`/`npm run build`/`npm test` still need to be run manually before merging.
`scripts.lint` uses `--max-warnings=0` so that warnings also fail the pipeline, not just
errors.

## Installing the CLI yourself (temporary: manual from source)

There is no `npm i -g aoox` yet (not published to any registry — a deliberate decision, see
above). The README (the part between `<!-- usagestop -->` and `# Commands`, **not** touched by `oclif
readme`) documents the manual method: `git clone` (private repo, needs GitLab credentials) →
`npm install && npm run build && npm link`. Consequence for `aoox install`: the target VPS needs Node
≥22 **and** this clone+build+link first, then `sudo aoox install` — there is no one-line bootstrap script yet
(`curl | sh`) that chains installing Node + fetching the CLI + `aoox install`; it is postponed until the
distribution channel is decided (automating the git clone with a token was also proposed & postponed by the user, not a
current priority). If the README is regenerated later (`npx oclif readme`, or automatically via
`prepack` on `npm pack`/tag), this manual-install section **survives**, because it sits outside the three
marker pairs (`toc`/`usage`/`commands`) — already verified through a real regeneration.

## `aoox env` and `aoox run` (`src/commands/env/*`, `src/commands/run.ts`, `src/lib/{env-command,link-command,variable-sets,env-*}.ts`)

Variables live in platform-level **variable sets** (API contract: aoox-api AGENTS.md, section "Variable sets"). The per-project environments of 0.1.0-alpha.9 and their `/projects/:id/environments…` endpoints are gone; so are the CLI's `--project` flag and the `development` default.

- **Selector**: `--set/-s <slug>` (slug first, then id, then case-insensitive name; `findSet`) and `--env/-e <name>`. Defaults (`pickSet`/`pickEnvironment` in `lib/variable-sets.ts`, pure, unit-tested): `--set` = the only set the linked application links, else the only set the caller can see; `--env` = the only environment of that set the application links. Several candidates are **never** guessed between: `SelectionError` lists the slugs/names and the command exits 1. No default environment name exists any more. The links come from `GET /applications/:id` (`variableSets`) only when a default is needed (both flags given = no owner request).
- **Owner** (`resolveOwner`): `--app <id>`, `--stack <id>` (compose stack, `GET /compose-apps/:id`; exclusive with `--app`), else the application in `.aoox.json`. `aoox link` itself still links applications only, so stacks are always named with `--stack`. A linked application that no longer exists → the old "Run `aoox link` again" message.
- Shared base `EnvCommand` (`lib/env-command.ts`): `fail()` (`❌ ` + plain hints, exit 1), `failFromApi()` (401, 403 via `friendlyForbidden` = "only instance owners and admins can read/change it" when the API says protected, 409 = "changed by someone else … Nothing was written" for writes), `resolveSet`, `resolveEnvironment` (→ `Resolved {config, set: VariableSetDetail, environment, label: '<slug>/<env>'}`), `reveal`/`revealById` (`POST /variable-sets/:id/environments/:envId/reveal`, audited; read-only tokens may call it, viewers get 403), `saveEnvironment` (`PUT /variable-sets/:id/environments/:envId {variables, expectedUpdatedAt, action, flags?}`; 400 prints the API message), `usedByNote`. `LinkCommand` (`lib/link-command.ts`) adds `replaceLinks` (`PUT /applications|compose-apps/:id/variable-sets {links}`, then prints the new list).
- **Commands**: `env list` (alias `env sets`; no flags = every visible set with role, sharing and its environments with key/usage counts from `GET /variable-sets`; `--set` = one set; `--env` = that environment's names masked, `--reveal` values), `env pull`, `env push --file`, `env set KEY=VALUE [--secret|--no-secret]`, `env unset KEY`, `env history [--limit]`, `env diff --from <env> --to <env>` (`GET /variable-sets/:id/diff`), `env promote --from <env> --to <env> KEY…|--all [--yes]` (`POST …/environments/<toId>/promote {from: <fromEnvId>, keys, expectedUpdatedAt}`), `env links`, `env link --set --env [--position n]`, `env unlink (--set --env | --position n)`. `diff`/`promote` take only `--set` (no `--env`). Writes always send the reveal's `updatedAt` as `expectedUpdatedAt` (the API always returns it now).
- **Links**: positions on the command line and in `env links` output are **1-based** (the API is 0-based). `addLink` (pure) appends by default (the new link wins), inserts at `--position`, moves an environment that is already linked, enforces 10; `removeLink`/`findLink` (by position in position order, or set + environment). `describeLinks` prints the merge order with the API's `shadowedKeys` ("overridden by a later link") and `overriddenByOwnEnv`. The whole ordered list is always PUT (GET → change → PUT); 400 (set not shared with the project) and 403 (viewer, protected environment needs the project admin) print the API message.
- **Quoting rules** (`lib/env-text.ts`, mirrors the API's `parseEnvLines`): one `KEY=VALUE` per line, value verbatim after the first `=`, no quote/escape processing anywhere; invalid names, newline/NUL and trailing whitespace refused client-side. `setVariables`/`unsetVariables` keep comments and order. `${{project.…}}` is refused client-side by `env set` (`projectReferenceKeys`) and `env push` (`checkEnvFile`) with "renamed to `${{vars.…}}`".
- `env pull`: exists check before the reveal, `wx` write, mode 0600, `--format dotenv|json|shell`, `--file -` = stdout only (notes to stderr), `git check-ignore` warning. `env push`: `checkEnvFile` (BOM/CRLF, `export`, duplicates, trailing whitespace refused; quoted values warned), summary, confirmation (`confirmOrFail`, no TTY → needs `--yes`).
- **`aoox run`** (`mergeForRun`, pure, unit-tested): default = the owner's links in position order, one reveal each **sequentially**; any refused reveal (protected, viewer, token scope) ends the command before the child starts (never a partial environment). Merge: later link wins, then the owner's own `env` (from `GET /applications/:id` / `/compose-apps/:id`) on top, then `--file` on top, all over `process.env`. `${{vars.KEY}}` is replaced by the merged **set** value of KEY (not the own env's), one level deep like the server (that value is used as written). `${{database…}}` and `${{secret…}}` (and a `${{vars.KEY}}` no linked set defines) are **left as written** with one warning naming the keys. Infisical-synced secrets (`secretSource.sync`) are not included (a warning). `--set`/`--env` = exactly that one set environment: no links, no own env. before the child starts, stderr gets one banner (`lib/run-banner.ts`, pure, unit-tested): `aoox  Injecting 12 variables into your process · Application "web": shared/production < payments/production < own env` (`--set/--env`: `Injecting 5 variables from shared/production (no links, no own env)`). The count is `Object.keys(layerVariables(merged.env, fileVars)).length`: what aoox adds or overrides (set layers, own env, `--file`), never the inherited `process.env`. Colour is raw ANSI, no dependency: on only when stderr is a TTY (and `TERM` is not `dumb`) or `FORCE_COLOR` is set (not `0`/`false`/empty); a non-empty `NO_COLOR` always wins; there is no `--no-color` flag. Warnings are `warn  …` lines (yellow label) printed by the command itself, not `this.warn`. `--quiet/-q` hides the banner and the `--file` references note, never the warnings (unresolved references, unknown `${{vars.…}}`, excluded Infisical secrets). Command tests need `runCommand(argv, undefined, {stripAnsi: false})` to see the codes. Nothing is written to disk. argv splitting at `--`, `.cmd`/`.bat` via a shell on Windows, exit code forwarding: unchanged from before.
- **Tests**: `test/lib/variable-sets.test.ts` (selection defaults and errors, link list changes, `describeLinks`, merge/references, `${{project.` refusal) and **`test/commands/env.test.ts`** — the first command tests with a fake panel: `globalThis.fetch` is replaced per test (it also answers discovery and `/auth/me`), then `@oclif/test` `runCommand` runs `env set` (request body, 409), `env pull` (protected 403 wording), `env link`, `env diff` and `aoox run` (a `node` child writes its env to a temp file). Note: `runCommand` joins an argv array with spaces, so arguments must not contain spaces. Plus the existing `env-text`, `env-run`, `env-file`, `env-stage3` specs.
- Not done: version reveal/restore from the CLI (the dashboard does it), creating/sharing sets or environments from the CLI (instance admin work in the dashboard), linking stacks through `aoox link`.

## Panel domain commands and the Compose version guard

- `aoox domain set` -> `PATCH /instance/domain`; `aoox domain clear [--yes]` (`src/commands/domain/clear.ts`) -> `DELETE /instance/domain` (back to `http://<PUBLIC_IP>:3000`; the proxy, app domains and the ACME email stay). Both need INSTALL_DIR in the panel's `.env.dist` (400) and a reachable Docker daemon on the panel host (502).
- `aoox reinstall` runs `docker compose` on the host with `docker-compose.override.yml` when it exists. The restrict-ports override uses the `!override` tag (Compose >= 2.24.4), so `src/lib/compose-version.ts` (`overrideGuardMessage`, pure, `test/lib/compose-version.test.ts`) refuses, after `ensureDocker()` and before any backup/write/pull, when the file contains the tag and `docker compose version --short` is older or unparsable. `--dry-run` also runs the check (when the plan includes the override) but only prints it as a warning and exits 0; with Docker/Compose unavailable it says the version could not be checked. `aoox install` writes fresh files and never passes the override; `aoox update` only calls the panel API, so neither needs the guard.
