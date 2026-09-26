# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Versions below 1.0.0 may include breaking changes in a minor release.

## [Unreleased]

## [0.1.0-alpha.1] - 2026-09-26

### Added

- `aoox domain set --web <host> --api <host> [--acme-email <email>]`: set a custom domain for the
  panel itself from the CLI, calling the panel's new `PATCH /instance/domain`.
- `aoox install` now writes `INSTALL_DIR` into `.env.dist`, so a freshly installed panel can use
  Settings → "Domain panel" (or `aoox domain set`) right away without an extra manual env edit.
- `aoox registry domain --set <host>` / `--clear`: set or remove a custom domain for the
  self-hosted registry, calling the panel's new `PATCH /registries/:id/domain`.
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

[Unreleased]: https://github.com/hideandseeklab/aoox-cli/compare/v0.1.0-alpha.1...HEAD
[0.1.0-alpha.1]: https://github.com/hideandseeklab/aoox-cli/compare/v0.1.0-alpha.0...v0.1.0-alpha.1
[0.1.0-alpha.0]: https://github.com/hideandseeklab/aoox-cli/releases/tag/v0.1.0-alpha.0
