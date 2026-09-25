# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Versions below 1.0.0 may include breaking changes in a minor release.

## [Unreleased]

## [0.1.0-alpha.0] - 2026-09-25

### Added

- Initial public alpha release, published to npm under the `alpha` dist-tag.
- `aoox login` — save the panel URL and an API token for other commands.
- `aoox link` — connect a local repo folder to an application on the panel.
- `aoox deploy` — build an image locally, push it to a registry, and trigger a deploy.
- `aoox install` — bootstrap aoox (postgres + api + web) on a fresh VPS via Docker Compose.
- `aoox whoami` — show the account and panel currently in use.

[Unreleased]: https://github.com/hideandseeklab/aoox-cli/compare/v0.1.0-alpha.0...HEAD
[0.1.0-alpha.0]: https://github.com/hideandseeklab/aoox-cli/releases/tag/v0.1.0-alpha.0
