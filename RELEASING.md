# Releasing

`aoox-cli` is versioned independently from `aoox-api`, `aoox-web`, and `aoox-landing` — see the
[Versioning](README.md#versioning) note in the README.

## One-time setup: the very first publish

CI publishes via npm **Trusted Publishing** (OIDC) — no token stored anywhere. The catch: you can
only register a trusted publisher for a package that already exists on npm, so the first-ever
publish has to be done by hand:

1. From your own machine. npm now requires 2FA to be **enabled** on the account before it will
   allow publishing at all (Account Settings → Two-Factor Authentication on npmjs.com) — if it's
   off, publish fails with a 403, not a prompt to turn it on. Once 2FA is on, pass a fresh code:
   ```bash
   npm publish --tag alpha --otp=123456
   ```
   The package is scoped (`@hideandseeklab/aoox`) and `publishConfig.access` in `package.json` is
   already set to `public`, so no `--access=public` flag is needed.
2. Once the `@hideandseeklab/aoox` package exists, go to npmjs.com → the package → **Settings →
   Trusted publishing** → add a GitHub Actions publisher:
   - Organization or user: `hideandseeklab`
   - Repository: `aoox-cli`
   - Workflow filename: `npm-publish.yml`
   - Allowed actions: enable **npm publish**
3. From then on, every tag push publishes automatically through
   [`.github/workflows/npm-publish.yml`](.github/workflows/npm-publish.yml) — no secret to create
   or rotate.

## Checklist

1. Make sure everything you want in this release is merged into `main`.
2. Move the `## [Unreleased]` entries in [CHANGELOG.md](CHANGELOG.md) into a new version section
   (e.g. `## [0.1.0-alpha.1] - 2026-10-01`), and add the compare/tag links at the bottom of the file.
3. Bump, tag, and push — all in one command:
   ```bash
   npm version 0.1.0-alpha.1
   ```
   This updates `package.json`, regenerates `README.md`'s command reference (the `version` script
   runs `oclif readme && git add README.md`), commits everything, creates the git tag
   `v0.1.0-alpha.1`, and (via `postversion`) pushes the commit and the tag.
4. This triggers two independent workflows on the pushed tag — a failure in one never blocks
   the other:
   - [`.github/workflows/npm-publish.yml`](.github/workflows/npm-publish.yml): builds, runs
     `npm test`, and publishes to npm via Trusted Publishing (see the one-time setup above — no
     token needed once that's configured). The dist-tag is derived from the version's pre-release
     label — `0.1.0-alpha.1` publishes under `alpha`, `0.2.0-beta.0` under `beta`, and a version
     with no pre-release label (e.g. `1.0.0`) publishes under `latest`.
   - [`.github/workflows/release-tarballs.yml`](.github/workflows/release-tarballs.yml): packs
     standalone tarballs (`oclif pack tarballs`, bundled Node.js — see the "Standalone tarball
     install" section below) for `linux-x64`/`linux-arm64`/`darwin-x64`/`darwin-arm64`, and
     creates (or reuses) a GitHub Release for the tag with those tarballs, their `.sha256`
     checksums, and stable-named copies (`aoox-<platform>-<arch>.tar.gz`/`.tar.xz`) attached —
     that's what `aoox-landing/public/install-cli.sh` downloads. A version with a pre-release
     label is marked as a GitHub prerelease automatically.

   Watch both run under the repo's **Actions** tab.
5. Once the workflows finish, sanity-check both outputs:
   ```bash
   npm view @hideandseeklab/aoox@alpha version
   npx -p @hideandseeklab/aoox@alpha aoox --version
   ```
   and open the new release under **Releases** — it should already have 32 assets (4 platforms ×
   2 formats `.tar.gz`/`.tar.xz` × 2 names each: oclif's original versioned+sha filename and the
   stable `aoox-<platform>-<arch>` one, each paired with its own `.sha256` file) and,
   for a pre-release version, the "Pre-release" badge. The release's auto-generated notes are a
   plain commit list — replace the body with the CHANGELOG.md entry for this version if you want
   something more readable there (`gh release edit <tag> --notes-file -` or via the GitHub UI).

## Standalone tarball install (`install-cli.sh`)

Separate from the npm package: `oclif pack tarballs` (configured in `package.json`'s
`oclif.update.node`, pinned Node version + target list) bundles a Node.js runtime with the CLI, so
`aoox-landing/public/install-cli.sh` can install `aoox` on a fresh Linux/macOS machine with no
Node.js at all — `curl -fsSL https://aoox.dev/install-cli.sh | sh`. Nothing about this needs a
manual step during a normal release: `release-tarballs.yml` (see above) builds and uploads it for
every tag automatically, using whatever is checked in at that tag (so a `postversion`/README
change from `npm version` is already included). If `install-cli.sh` itself needs a change (new env
var, new platform), edit it directly in `aoox-landing/public/` — it doesn't need a matching version
bump in `aoox-cli`, since it always resolves "latest" via the GitHub Releases API (or an explicit
`AOOX_VERSION`) rather than pinning a version in its own source.

## If the bundled compose files changed

If this release touches `docker-compose.dist.yml` or `docker-compose.domain.yml` in `aoox-api`,
re-copy them into `assets/install/` **before** step 3 above — `aoox install` ships whatever is
bundled at publish time, not a live fetch from `aoox-api`. See `assets/install/README.md`.

## First release only

`postversion` only runs on a *version change* — `npm version` refuses to re-set the version already
in `package.json`. This repo's first publish is already manual anyway (see "One-time setup" above),
so just run the manual `npm publish --tag alpha` there and skip `npm version` for that one.

## If something needs a same-day fix after a release

Don't unpublish or overwrite the git tag. Fix forward: merge the fix, then cut a new patch-ish
version (e.g. `0.1.0-alpha.2`) through the same checklist above. `npm unpublish` is a last resort
(npm restricts it after 72 hours, and it can break anyone who already installed that version).
