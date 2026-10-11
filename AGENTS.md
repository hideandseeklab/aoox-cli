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
- `test/**/*.test.ts` — mocha + chai. Pure helpers are tested directly; commands that touch
  the network are **not** tested (there is no HTTP mock yet) — a `@oclif/test` `runCommand` template is provided
  for commands that do not need the network.

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

- `aoox login` stores `{url, token}` in `<configDir>/config.json` with mode `0600`
  (`chmod` follows `writeFile` because `mode` only applies when the file is created; failure on Windows is ignored).
- Token = **platform API token** (`aoox_…`, created in the panel under Settings → Account), not a session JWT.
  It acts as its owner user and is re-read from the DB on every request on the API side.
- The `--url`/`--token` flags are in `src/lib/flags.ts` and carry oclif `env:`
  (`AOOX_URL`, `AOOX_TOKEN`), so CI does not need `aoox login` and the fallback
  still shows in `--help`.
- `resolveCredentials()` (pure, unit-tested): flag/env wins per field, **except** that a
  stored token is never sent to another panel — `--url` pointing to a different host without `--token` is rejected,
  so credentials do not leak to the wrong host.
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

Already available: `aoox login`, `aoox whoami`, `aoox link`, `aoox deploy`, `aoox install`.
Next: `aoox logs` (Socket.IO `/logs` + 60-second ticket, its protocol mirrored from the API) — `aoox
deploy` now already follows the deployment log itself via polling, so the Socket.IO-based `aoox logs` above is
only needed for live container logs outside the context of a single deploy.

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

## CI

`.github/workflows/npm-publish.yml`: every `git push --follow-tags` creates a `v*` tag that triggers
build + `npm test` + `npm publish`; the npm dist-tag is derived from the version's pre-release label
(`0.1.0-alpha.1` → `alpha`, `1.0.0` without a label → `latest`) — see `RELEASING.md`. Authentication
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
