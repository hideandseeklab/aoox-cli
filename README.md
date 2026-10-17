aoox
=================

CLI for [aoox](https://github.com/hideandseeklab/aoox-api), a self-hosted PaaS — build and deploy

Website: [aoox.dev](https://aoox.dev) · Docs: [aoox.dev/docs](https://aoox.dev/docs) · Changelog: [aoox.dev/changelog](https://aoox.dev/changelog)

Related repos: [aoox-api](https://github.com/hideandseeklab/aoox-api) (backend) ·
[aoox-web](https://github.com/hideandseeklab/aoox-web) (dashboard) ·
[aoox-landing](https://github.com/hideandseeklab/aoox-landing) (website and docs).


[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/%40hideandseeklab%2Faoox.svg)](https://npmjs.org/package/@hideandseeklab/aoox)
[![Downloads/week](https://img.shields.io/npm/dw/%40hideandseeklab%2Faoox.svg)](https://npmjs.org/package/@hideandseeklab/aoox)


<!-- toc -->
* [Usage](#usage)
* [Installation](#installation)
* [Commands](#commands)
<!-- tocstop -->
* [Usage](#usage)
* [Installation](#installation)
* [Commands](#commands)
<!-- tocstop -->
* [Usage](#usage)
* [Installation](#installation)
* [Commands](#commands)
<!-- tocstop -->
# Usage
<!-- usage -->
```sh-session
$ npm install -g @hideandseeklab/aoox
$ aoox COMMAND
running command...
$ aoox (--version)
@hideandseeklab/aoox/0.1.0-alpha.12 win32-x64 node-v24.12.0
$ aoox --help [COMMAND]
USAGE
  $ aoox COMMAND
...
```
<!-- usagestop -->
```sh-session
$ npm install -g @hideandseeklab/aoox
$ aoox COMMAND
running command...
$ aoox (--version)
@hideandseeklab/aoox/0.1.0-alpha.11 win32-x64 node-v24.12.0
$ aoox --help [COMMAND]
USAGE
  $ aoox COMMAND
...
```
<!-- usagestop -->
```sh-session
$ npm install -g @hideandseeklab/aoox
$ aoox COMMAND
running command...
$ aoox (--version)
@hideandseeklab/aoox/0.1.0-alpha.8 win32-x64 node-v24.12.0
$ aoox --help [COMMAND]
USAGE
  $ aoox COMMAND
...
```
<!-- usagestop -->

# Installation

## Linux / macOS (no Node.js required)

A standalone install script downloads a tarball with its own bundled Node.js runtime — nothing
to install first, works even on a machine that will never otherwise touch Node.js (e.g. a bare
VPS before running `aoox install` on it):

```sh-session
curl -fsSL https://aoox.dev/install-cli.sh | sh
```

This installs to `/usr/local/lib/aoox` + `/usr/local/bin/aoox` when run as root or with
passwordless `sudo` available, or `~/.local/lib/aoox` + `~/.local/bin/aoox` otherwise (a `curl |
sh` pipe can't relay an interactive `sudo` password prompt safely, so the script never tries).
Re-running it upgrades in place. Supports Linux (glibc — not Alpine/musl) and macOS on x64/arm64;
anything else needs the npm install below instead. See the comment header of
[`install-cli.sh`](https://github.com/hideandseeklab/aoox-landing/blob/main/public/install-cli.sh)
for every environment variable it accepts (pinning a version, a custom install directory, etc).

## npm (Windows, Alpine, or if you already have Node.js)

```sh-session
npm install -g @hideandseeklab/aoox
```

While the project is in alpha every release is published under both the `latest` and `alpha` tags, so no tag is needed. To update later, run `aoox update` (`aoox update panel` updates the panel).

`aoox` is then available globally. This also applies to `aoox install` on a new VPS —
Node ≥22 must already be installed on that VPS **before** the step above (`aoox install`
itself needs Node to run, so it cannot install Node for you first) — or use the install script
above, which needs no Node.js on the VPS at all.

## From source

To install from source (e.g. to contribute, or to get the latest `main` before it is
released to npm):

```sh-session
git clone https://github.com/hideandseeklab/aoox-cli.git
cd aoox-cli
npm install
npm run build
npm link            # or: npm install -g .
```

## Image name and version from the project

`aoox registry build` and `aoox registry push` do not need `name:version` typed in full. With no argument (or a name without a version) the CLI fills the gaps, in this order, from the build context (`push`: the current directory); the first source that has the value wins and is named in the output:

| # | Source | Name | Version |
| - | ------ | ---- | ------- |
| 1 | `package.json` | `name`, npm scope removed (`@acme/web` becomes `web`) | `version` |
| 2 | `pyproject.toml` | `[project]` or `[tool.poetry]` name | version (skipped when `dynamic`) |
| 3 | `Cargo.toml` | `[package]` name | `[package]` version (not a workspace one) |
| 4 | `composer.json` | `name`, vendor removed | `version`, if present |
| 5 | `pubspec.yaml` | `name` | `version` |
| 6 | `*.csproj` (exactly one) | `AssemblyName`, else the file name | `Version`, or `VersionPrefix`-`VersionSuffix` |
| 7 | `pom.xml` | project `artifactId` | project `version` (not the parent's) |
| 8 | `VERSION` | - | first non-empty line |
| 9 | git tag | - | the tag HEAD is exactly on, leading `v` removed |
| 10 | folder name | the folder, lowercased | - |

Names are lowercased; a `+` in a version becomes `_` (tags cannot contain it). A value that cannot be read with certainty (an MSBuild `$(...)` or Maven `${...}` variable, `version.workspace`) is skipped. If HEAD is past the last tag the CLI refuses instead of guessing (tag it, type `name:version`, or `--force` to use the `git describe` form `1.4.2-3-gabc1234`). Because the result is derived, the CLI prints where it came from and asks `Build web:1.4.2? (Y/n/e)` first (`Y` continue, `n` abort, `e` edit); `--yes` skips the question, and without a terminal (or with `CI` set) it refuses and asks for `name:version` or `--yes`. A fully typed `name:version` never asks. The "version already exists" check still applies, so forgetting to bump the version never overwrites an image.

## Colours

Step lines (`==> ...`), results, warnings and hints are coloured when the output is a terminal. `NO_COLOR=1` turns colour off, `FORCE_COLOR=1` turns it on without a terminal (for example in some CI logs). Output meant for pipes (`aoox env pull` to stdout) and docker's own output are never coloured by the CLI.

## Behind an antivirus or corporate proxy

Antivirus HTTPS scanning (AVG, Avast, Kaspersky, ESET, Bitdefender) and corporate proxies (Zscaler,
Netskope, Fortinet, Palo Alto) re-sign HTTPS traffic with their own root certificate, which is
installed in the operating system's store but unknown to Node. On Node 22.19+ / 24.5+ aoox trusts
the system store in addition to Node's bundled list, so this works without any setup. Certificate
verification is never turned off.

- `AOOX_SYSTEM_CA=0` opts out (Node's bundled list only).
- `NODE_EXTRA_CA_CERTS=<root.pem>` still works and is kept.
- On older Node, set `NODE_OPTIONS=--use-system-ca` (Node 22.15+/23.10+), or upgrade Node, or add the panel's domain to the antivirus HTTPS-scanning exclusions.
- If verification still fails because of an unknown issuer, the error names the issuer it saw.

# Commands
<!-- commands -->
* [`aoox deploy`](#aoox-deploy)
* [`aoox domain clear`](#aoox-domain-clear)
* [`aoox domain set`](#aoox-domain-set)
* [`aoox env diff`](#aoox-env-diff)
* [`aoox env history`](#aoox-env-history)
* [`aoox env link`](#aoox-env-link)
* [`aoox env links`](#aoox-env-links)
* [`aoox env list`](#aoox-env-list)
* [`aoox env promote`](#aoox-env-promote)
* [`aoox env pull`](#aoox-env-pull)
* [`aoox env push`](#aoox-env-push)
* [`aoox env set ASSIGNMENTS`](#aoox-env-set-assignments)
* [`aoox env sets`](#aoox-env-sets)
* [`aoox env unlink`](#aoox-env-unlink)
* [`aoox env unset KEYS`](#aoox-env-unset-keys)
* [`aoox help [COMMAND]`](#aoox-help-command)
* [`aoox install`](#aoox-install)
* [`aoox link`](#aoox-link)
* [`aoox login`](#aoox-login)
* [`aoox plugins`](#aoox-plugins)
* [`aoox plugins add PLUGIN`](#aoox-plugins-add-plugin)
* [`aoox plugins:inspect PLUGIN...`](#aoox-pluginsinspect-plugin)
* [`aoox plugins install PLUGIN`](#aoox-plugins-install-plugin)
* [`aoox plugins link PATH`](#aoox-plugins-link-path)
* [`aoox plugins remove [PLUGIN]`](#aoox-plugins-remove-plugin)
* [`aoox plugins reset`](#aoox-plugins-reset)
* [`aoox plugins uninstall [PLUGIN]`](#aoox-plugins-uninstall-plugin)
* [`aoox plugins unlink [PLUGIN]`](#aoox-plugins-unlink-plugin)
* [`aoox plugins update`](#aoox-plugins-update)
* [`aoox registry build [IMAGE]`](#aoox-registry-build-image)
* [`aoox registry domain`](#aoox-registry-domain)
* [`aoox registry push [IMAGE]`](#aoox-registry-push-image)
* [`aoox reinstall`](#aoox-reinstall)
* [`aoox run`](#aoox-run)
* [`aoox update`](#aoox-update)
* [`aoox update panel`](#aoox-update-panel)
* [`aoox whoami`](#aoox-whoami)

## `aoox deploy`

Build a local image, push it to the aoox registry, then deploy (the repo must be linked with `aoox link` first)

```
USAGE
  $ aoox deploy [-t <value>] [-u <value>] [--context <value>] [-f <value>] [--registry <value>] [--tag
    <value>]

FLAGS
  -f, --dockerfile=<value>  [default: Dockerfile] Path to the Dockerfile
  -t, --token=<value>       [env: AOOX_TOKEN] API token (aoox_…); defaults to the value from `aoox login`
  -u, --url=<value>         [env: AOOX_URL] Dashboard URL (the address you open the dashboard with, e.g.
                            https://dashboard.example.com); defaults to the value from `aoox login`
      --context=<value>     [default: .] Docker build context
      --registry=<value>    Registry ID to push to; defaults to the self-hosted registry
      --tag=<value>         Image tag; defaults to the git short SHA (+ -dirty)

DESCRIPTION
  Build a local image, push it to the aoox registry, then deploy (the repo must be linked with `aoox link` first)

EXAMPLES
  $ aoox deploy

  $ aoox deploy --tag v1.2.3
```

_See code: [src/commands/deploy.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.12/src/commands/deploy.ts)_

## `aoox domain clear`

Remove the custom domain of the panel itself and go back to IP access (IP:3000) through the running panel API

```
USAGE
  $ aoox domain clear [-t <value>] [-u <value>] [-y]

FLAGS
  -t, --token=<value>  [env: AOOX_TOKEN] API token (aoox_…); defaults to the value from `aoox login`
  -u, --url=<value>    [env: AOOX_URL] Dashboard URL (the address you open the dashboard with, e.g.
                       https://dashboard.example.com); defaults to the value from `aoox login`
  -y, --yes            Do not ask for confirmation

DESCRIPTION
  Remove the custom domain of the panel itself and go back to IP access (IP:3000) through the running panel API

EXAMPLES
  $ aoox domain clear

  $ aoox domain clear --yes
```

_See code: [src/commands/domain/clear.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.12/src/commands/domain/clear.ts)_

## `aoox domain set`

Set a custom domain for the panel itself (not an application) through the running panel API

```
USAGE
  $ aoox domain set --api <value> --web <value> [-t <value>] [-u <value>] [--acme-email <value>] [--domain-only]

FLAGS
  -t, --token=<value>       [env: AOOX_TOKEN] API token (aoox_…); defaults to the value from `aoox login`
  -u, --url=<value>         [env: AOOX_URL] Dashboard URL (the address you open the dashboard with, e.g.
                            https://dashboard.example.com); defaults to the value from `aoox login`
      --acme-email=<value>  Email for the Let's Encrypt certificate
      --api=<value>         (required) Domain for the panel API
      --[no-]domain-only    Only allow access through the domain: ports 3000/3001 listen on 127.0.0.1 only (default:
                            keep the current setting). Use --no-domain-only to open them again. Make sure the domain
                            works first, or you lose IP:port access
      --web=<value>         (required) Domain for the panel dashboard

DESCRIPTION
  Set a custom domain for the panel itself (not an application) through the running panel API

EXAMPLES
  $ aoox domain set --web panel.example.com --api api.example.com

  $ aoox domain set --web panel.example.com --api api.example.com --acme-email you@example.com

  $ aoox domain set --web panel.example.com --api api.example.com --domain-only
```

_See code: [src/commands/domain/set.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.12/src/commands/domain/set.ts)_

## `aoox env diff`

Compare two environments of a variable set key by key: which variables exist on one side only and which have different values. Prints names only, never values

```
USAGE
  $ aoox env diff --from <value> --to <value> [--json] [-t <value>] [-u <value>] [--stack <value> | --app
    <value>] [-s <value>]

FLAGS
  -s, --set=<value>    Variable set slug (or name). Default: the only set the linked application links, or the only set
                       you can see
  -t, --token=<value>  [env: AOOX_TOKEN] API token (aoox_…); defaults to the value from `aoox login`
  -u, --url=<value>    [env: AOOX_URL] Dashboard URL (the address you open the dashboard with, e.g.
                       https://dashboard.example.com); defaults to the value from `aoox login`
      --app=<value>    Application ID; defaults to the application linked with `aoox link`
      --from=<value>   (required) Environment to compare from
      --stack=<value>  Compose stack ID, instead of an application
      --to=<value>     (required) Environment to compare to

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Compare two environments of a variable set key by key: which variables exist on one side only and which have different
  values. Prints names only, never values

EXAMPLES
  $ aoox env diff --set shared --from staging --to production
```

_See code: [src/commands/env/diff.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.12/src/commands/env/diff.ts)_

## `aoox env history`

Show the version history of a variable set environment: when, who, and which variable names were added (+), changed (~) or removed (-). Values are never shown

```
USAGE
  $ aoox env history [--json] [-t <value>] [-u <value>] [--stack <value> | --app <value>] [-e <value>] [-s
    <value>] [--limit <value>]

FLAGS
  -e, --env=<value>    Environment of the set (e.g. development, staging, production). Default: the only environment of
                       the set the linked application links
  -s, --set=<value>    Variable set slug (or name). Default: the only set the linked application links, or the only set
                       you can see
  -t, --token=<value>  [env: AOOX_TOKEN] API token (aoox_…); defaults to the value from `aoox login`
  -u, --url=<value>    [env: AOOX_URL] Dashboard URL (the address you open the dashboard with, e.g.
                       https://dashboard.example.com); defaults to the value from `aoox login`
      --app=<value>    Application ID; defaults to the application linked with `aoox link`
      --limit=<value>  [default: 20] How many versions to show (newest first)
      --stack=<value>  Compose stack ID, instead of an application

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Show the version history of a variable set environment: when, who, and which variable names were added (+), changed
  (~) or removed (-). Values are never shown

EXAMPLES
  $ aoox env history --set shared --env production

  $ aoox env history --limit 5 --json
```

_See code: [src/commands/env/history.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.12/src/commands/env/history.ts)_

## `aoox env link`

Link a variable set environment to the linked application (or --stack). It is added last, so it wins over the other links, unless --position is given; an environment that is already linked is moved. Takes effect on the next deploy

```
USAGE
  $ aoox env link -e <value> -s <value> [--json] [-t <value>] [-u <value>] [--stack <value> | --app <value>]
    [--position <value>]

FLAGS
  -e, --env=<value>       (required) Environment of the set
  -s, --set=<value>       (required) Variable set slug (or name)
  -t, --token=<value>     [env: AOOX_TOKEN] API token (aoox_…); defaults to the value from `aoox login`
  -u, --url=<value>       [env: AOOX_URL] Dashboard URL (the address you open the dashboard with, e.g.
                          https://dashboard.example.com); defaults to the value from `aoox login`
      --app=<value>       Application ID; defaults to the application linked with `aoox link`
      --position=<value>  1-based place in the list (1 = first, overridden by every later link). Default: last
      --stack=<value>     Compose stack ID, instead of an application

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Link a variable set environment to the linked application (or --stack). It is added last, so it wins over the other
  links, unless --position is given; an environment that is already linked is moved. Takes effect on the next deploy

EXAMPLES
  $ aoox env link --set shared --env production

  $ aoox env link --set defaults --env production --position 1
```

_See code: [src/commands/env/link.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.12/src/commands/env/link.ts)_

## `aoox env links`

Show the variable set environments the linked application (or --stack) uses, in merge order, with the variables a later link or the own env overrides

```
USAGE
  $ aoox env links [--json] [-t <value>] [-u <value>] [--stack <value> | --app <value>]

FLAGS
  -t, --token=<value>  [env: AOOX_TOKEN] API token (aoox_…); defaults to the value from `aoox login`
  -u, --url=<value>    [env: AOOX_URL] Dashboard URL (the address you open the dashboard with, e.g.
                       https://dashboard.example.com); defaults to the value from `aoox login`
      --app=<value>    Application ID; defaults to the application linked with `aoox link`
      --stack=<value>  Compose stack ID, instead of an application

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Show the variable set environments the linked application (or --stack) uses, in merge order, with the variables a
  later link or the own env overrides

EXAMPLES
  $ aoox env links

  $ aoox env links --stack <id>
```

_See code: [src/commands/env/links.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.12/src/commands/env/links.ts)_

## `aoox env list`

List the variable sets you can see and their environments (with --set: one set; with --env: the variable names of one environment). Values are masked unless --reveal is given

```
USAGE
  $ aoox env list [--json] [-t <value>] [-u <value>] [--stack <value> | --app <value>] [-e <value>] [--reveal]
    [-s <value>]

FLAGS
  -e, --env=<value>    Environment name; lists its variable names (the set defaults like in the other env commands)
  -s, --set=<value>    Variable set slug (or name). Default: the only set the linked application links, or the only set
                       you can see
  -t, --token=<value>  [env: AOOX_TOKEN] API token (aoox_…); defaults to the value from `aoox login`
  -u, --url=<value>    [env: AOOX_URL] Dashboard URL (the address you open the dashboard with, e.g.
                       https://dashboard.example.com); defaults to the value from `aoox login`
      --app=<value>    Application ID; defaults to the application linked with `aoox link`
      --reveal         Show the values (needs --env; the read is recorded in the audit log)
      --stack=<value>  Compose stack ID, instead of an application

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  List the variable sets you can see and their environments (with --set: one set; with --env: the variable names of one
  environment). Values are masked unless --reveal is given

ALIASES
  $ aoox env sets

EXAMPLES
  $ aoox env list

  $ aoox env list --set shared

  $ aoox env list --set shared --env staging

  $ aoox env list --set shared --env development --reveal
```

_See code: [src/commands/env/list.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.12/src/commands/env/list.ts)_

## `aoox env promote`

Copy variables (and their secret flag) from one environment of a variable set to another (name them, or use --all). Needs the right to read the source and to change the target. The target keeps its comments and order; new variables are appended. Shows what changes and asks before writing (unless --yes)

```
USAGE
  $ aoox env promote --from <value> --to <value> [-t <value>] [-u <value>] [--stack <value> | --app <value>]
    [--all] [-s <value>] [-y]

FLAGS
  -s, --set=<value>    Variable set slug (or name). Default: the only set the linked application links, or the only set
                       you can see
  -t, --token=<value>  [env: AOOX_TOKEN] API token (aoox_…); defaults to the value from `aoox login`
  -u, --url=<value>    [env: AOOX_URL] Dashboard URL (the address you open the dashboard with, e.g.
                       https://dashboard.example.com); defaults to the value from `aoox login`
  -y, --yes            Do not ask for confirmation
      --all            Promote every variable of the source (those already equal are skipped)
      --app=<value>    Application ID; defaults to the application linked with `aoox link`
      --from=<value>   (required) Environment to copy the values from
      --stack=<value>  Compose stack ID, instead of an application
      --to=<value>     (required) Environment to copy the values into

DESCRIPTION
  Copy variables (and their secret flag) from one environment of a variable set to another (name them, or use --all).
  Needs the right to read the source and to change the target. The target keeps its comments and order; new variables
  are appended. Shows what changes and asks before writing (unless --yes)

EXAMPLES
  $ aoox env promote --set shared --from staging --to production API_URL FEATURE_X

  $ aoox env promote --from development --to staging --all --yes
```

_See code: [src/commands/env/promote.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.12/src/commands/env/promote.ts)_

## `aoox env pull`

Write the variables of a variable set environment to a local file (mode 0600), or to standard output with --file -. Refuses to overwrite unless --force. The read is recorded in the audit log

```
USAGE
  $ aoox env pull [-t <value>] [-u <value>] [--stack <value> | --app <value>] [-e <value>] [-s <value>]
    [--file <value>] [--force] [--format dotenv|json|shell]

FLAGS
  -e, --env=<value>      Environment of the set (e.g. development, staging, production). Default: the only environment
                         of the set the linked application links
  -s, --set=<value>      Variable set slug (or name). Default: the only set the linked application links, or the only
                         set you can see
  -t, --token=<value>    [env: AOOX_TOKEN] API token (aoox_…); defaults to the value from `aoox login`
  -u, --url=<value>      [env: AOOX_URL] Dashboard URL (the address you open the dashboard with, e.g.
                         https://dashboard.example.com); defaults to the value from `aoox login`
      --app=<value>      Application ID; defaults to the application linked with `aoox link`
      --file=<value>     File to write, relative to the current folder; "-" writes to standard output (nothing else is
                         printed there). Default: .env, .env.json or .env.sh by format
      --force            Overwrite the file if it exists
      --format=<option>  [default: dotenv] dotenv (the stored text, comments kept), json ({"KEY":"value"}) or shell
                         (export KEY='value' lines for eval)
                         <options: dotenv|json|shell>
      --stack=<value>    Compose stack ID, instead of an application

DESCRIPTION
  Write the variables of a variable set environment to a local file (mode 0600), or to standard output with --file -.
  Refuses to overwrite unless --force. The read is recorded in the audit log

EXAMPLES
  $ aoox env pull

  $ aoox env pull --set shared --env staging --file .env.staging

  $ aoox env pull --force

  $ aoox env pull --format json --file -

  $ aoox env pull --format shell --file -
```

_See code: [src/commands/env/pull.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.12/src/commands/env/pull.ts)_

## `aoox env push`

Replace the whole text of a variable set environment with a local .env file. Shows what is added, changed and removed and asks before writing (unless --yes); the write fails if someone else changed the environment in between

```
USAGE
  $ aoox env push --file <value> [-t <value>] [-u <value>] [--stack <value> | --app <value>] [-e <value>] [-s
    <value>] [-y]

FLAGS
  -e, --env=<value>    Environment of the set (e.g. development, staging, production). Default: the only environment of
                       the set the linked application links
  -s, --set=<value>    Variable set slug (or name). Default: the only set the linked application links, or the only set
                       you can see
  -t, --token=<value>  [env: AOOX_TOKEN] API token (aoox_…); defaults to the value from `aoox login`
  -u, --url=<value>    [env: AOOX_URL] Dashboard URL (the address you open the dashboard with, e.g.
                       https://dashboard.example.com); defaults to the value from `aoox login`
  -y, --yes            Do not ask for confirmation
      --app=<value>    Application ID; defaults to the application linked with `aoox link`
      --file=<value>   (required) The .env file to upload
      --stack=<value>  Compose stack ID, instead of an application

DESCRIPTION
  Replace the whole text of a variable set environment with a local .env file. Shows what is added, changed and removed
  and asks before writing (unless --yes); the write fails if someone else changed the environment in between

EXAMPLES
  $ aoox env push --file .env

  $ aoox env push --file .env.staging --set shared --env staging --yes
```

_See code: [src/commands/env/push.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.12/src/commands/env/push.ts)_

## `aoox env set ASSIGNMENTS`

Set one or more variables in a variable set environment. Existing comments and order are kept; the write fails if someone else changed the environment in between

```
USAGE
  $ aoox env set ASSIGNMENTS... [-t <value>] [-u <value>] [--stack <value> | --app <value>] [-e <value>] [-s
    <value>] [--secret]

ARGUMENTS
  ASSIGNMENTS...  KEY=VALUE (the value is stored exactly as given)

FLAGS
  -e, --env=<value>    Environment of the set (e.g. development, staging, production). Default: the only environment of
                       the set the linked application links
  -s, --set=<value>    Variable set slug (or name). Default: the only set the linked application links, or the only set
                       you can see
  -t, --token=<value>  [env: AOOX_TOKEN] API token (aoox_…); defaults to the value from `aoox login`
  -u, --url=<value>    [env: AOOX_URL] Dashboard URL (the address you open the dashboard with, e.g.
                       https://dashboard.example.com); defaults to the value from `aoox login`
      --app=<value>    Application ID; defaults to the application linked with `aoox link`
      --[no-]secret    Mark the variables as secret (--secret: always masked in logs) or explicitly not secret
                       (--no-secret: never masked). Without either the flag is left as it is
      --stack=<value>  Compose stack ID, instead of an application

DESCRIPTION
  Set one or more variables in a variable set environment. Existing comments and order are kept; the write fails if
  someone else changed the environment in between

EXAMPLES
  $ aoox env set API_URL=https://api.example.com --set shared --env production

  $ aoox env set GREETING="hello world" QUERY=a=b --env staging

  $ aoox env set API_TOKEN=abc123 --secret
```

_See code: [src/commands/env/set.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.12/src/commands/env/set.ts)_

## `aoox env sets`

List the variable sets you can see and their environments (with --set: one set; with --env: the variable names of one environment). Values are masked unless --reveal is given

```
USAGE
  $ aoox env sets [--json] [-t <value>] [-u <value>] [--stack <value> | --app <value>] [-e <value>] [--reveal]
    [-s <value>]

FLAGS
  -e, --env=<value>    Environment name; lists its variable names (the set defaults like in the other env commands)
  -s, --set=<value>    Variable set slug (or name). Default: the only set the linked application links, or the only set
                       you can see
  -t, --token=<value>  [env: AOOX_TOKEN] API token (aoox_…); defaults to the value from `aoox login`
  -u, --url=<value>    [env: AOOX_URL] Dashboard URL (the address you open the dashboard with, e.g.
                       https://dashboard.example.com); defaults to the value from `aoox login`
      --app=<value>    Application ID; defaults to the application linked with `aoox link`
      --reveal         Show the values (needs --env; the read is recorded in the audit log)
      --stack=<value>  Compose stack ID, instead of an application

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  List the variable sets you can see and their environments (with --set: one set; with --env: the variable names of one
  environment). Values are masked unless --reveal is given

ALIASES
  $ aoox env sets

EXAMPLES
  $ aoox env sets

  $ aoox env sets --set shared

  $ aoox env sets --set shared --env staging

  $ aoox env sets --set shared --env development --reveal
```

## `aoox env unlink`

Remove a variable set environment from the linked application (or --stack). Name it with --set and --env, or with its --position from `aoox env links`. Takes effect on the next deploy

```
USAGE
  $ aoox env unlink [--json] [-t <value>] [-u <value>] [--stack <value> | --app <value>] [--position <value> |
    -s <value> | -e <value>]

FLAGS
  -e, --env=<value>       Environment of the set
  -s, --set=<value>       Variable set slug (or name)
  -t, --token=<value>     [env: AOOX_TOKEN] API token (aoox_…); defaults to the value from `aoox login`
  -u, --url=<value>       [env: AOOX_URL] Dashboard URL (the address you open the dashboard with, e.g.
                          https://dashboard.example.com); defaults to the value from `aoox login`
      --app=<value>       Application ID; defaults to the application linked with `aoox link`
      --position=<value>  1-based position as shown by `aoox env links`
      --stack=<value>     Compose stack ID, instead of an application

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Remove a variable set environment from the linked application (or --stack). Name it with --set and --env, or with its
  --position from `aoox env links`. Takes effect on the next deploy

EXAMPLES
  $ aoox env unlink --set shared --env staging

  $ aoox env unlink --position 2
```

_See code: [src/commands/env/unlink.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.12/src/commands/env/unlink.ts)_

## `aoox env unset KEYS`

Remove one or more variables from a variable set environment. Comments and the other variables are kept; the write fails if someone else changed the environment in between

```
USAGE
  $ aoox env unset KEYS... [-t <value>] [-u <value>] [--stack <value> | --app <value>] [-e <value>] [-s <value>]

ARGUMENTS
  KEYS...  Variable name(s) to remove

FLAGS
  -e, --env=<value>    Environment of the set (e.g. development, staging, production). Default: the only environment of
                       the set the linked application links
  -s, --set=<value>    Variable set slug (or name). Default: the only set the linked application links, or the only set
                       you can see
  -t, --token=<value>  [env: AOOX_TOKEN] API token (aoox_…); defaults to the value from `aoox login`
  -u, --url=<value>    [env: AOOX_URL] Dashboard URL (the address you open the dashboard with, e.g.
                       https://dashboard.example.com); defaults to the value from `aoox login`
      --app=<value>    Application ID; defaults to the application linked with `aoox link`
      --stack=<value>  Compose stack ID, instead of an application

DESCRIPTION
  Remove one or more variables from a variable set environment. Comments and the other variables are kept; the write
  fails if someone else changed the environment in between

EXAMPLES
  $ aoox env unset OLD_KEY

  $ aoox env unset A B --set shared --env staging
```

_See code: [src/commands/env/unset.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.12/src/commands/env/unset.ts)_

## `aoox help [COMMAND]`

Display help for aoox.

```
USAGE
  $ aoox help [COMMAND...] [-n]

ARGUMENTS
  [COMMAND...]  Command to show help for.

FLAGS
  -n, --nested-commands  Include all nested commands in the output.

DESCRIPTION
  Display help for aoox.
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/6.3.0/src/commands/help.ts)_

## `aoox install`

Install aoox (postgres + api + web) on a fresh VPS with Docker Compose

```
USAGE
  $ aoox install [--acme-email <value>] [--admin-name <value> --admin-email <value>] [--admin-password
    <value> ] [--api-domain <value> --web-domain <value>] [--dir <value>] [--force] [--no-terminal-authorize]
    [--terminal-ssh-user <value>] [-y]

FLAGS
  -y, --yes                        Do not ask for any confirmation
      --acme-email=<value>         Required with --web-domain/--api-domain (Let’s Encrypt)
      --admin-email=<value>        Create the first owner without going through /setup in the browser
      --admin-name=<value>         Name of the first owner
      --admin-password=<value>     Password of the first owner (min. 8 characters)
      --api-domain=<value>         Domain for the API, served through the bundled proxy
      --dir=<value>                [default: /opt/aoox] Installation directory
      --force                      Overwrite an existing installation in --dir
      --no-terminal-authorize      Do not create/authorize the web Terminal SSH key automatically (do it in Settings >
                                   Terminal instead)
      --terminal-ssh-user=<value>  SSH user the web Terminal uses to log in to this host (default: the user running
                                   sudo, or root if there is none)
      --web-domain=<value>         Domain for the web panel, served through the bundled proxy

DESCRIPTION
  Install aoox (postgres + api + web) on a fresh VPS with Docker Compose

EXAMPLES
  sudo aoox install

  sudo aoox install --web-domain panel.example.com --api-domain api.panel.example.com --acme-email me@example.com
```

_See code: [src/commands/install.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.12/src/commands/install.ts)_

## `aoox link`

Link this folder to an application in the panel (used by `aoox deploy`, `aoox run` without `--set`/`--env`, and the `aoox env` defaults and links)

```
USAGE
  $ aoox link [-t <value>] [-u <value>] [--app <value>] [--project <value>]

FLAGS
  -t, --token=<value>    [env: AOOX_TOKEN] API token (aoox_…); defaults to the value from `aoox login`
  -u, --url=<value>      [env: AOOX_URL] Dashboard URL (the address you open the dashboard with, e.g.
                         https://dashboard.example.com); defaults to the value from `aoox login`
      --app=<value>      Application ID; skip the interactive selection
      --project=<value>  Project ID; skip the interactive selection

DESCRIPTION
  Link this folder to an application in the panel (used by `aoox deploy`, `aoox run` without `--set`/`--env`, and the
  `aoox env` defaults and links)

EXAMPLES
  $ aoox link

  $ aoox link --project <id> --app <id>
```

_See code: [src/commands/link.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.12/src/commands/link.ts)_

## `aoox login`

Save the dashboard address and API token for other commands (the API address is discovered automatically)

```
USAGE
  $ aoox login [-t <value>] [-u <value>]

FLAGS
  -t, --token=<value>  [env: AOOX_TOKEN] API token (aoox_…); defaults to the value from `aoox login`
  -u, --url=<value>    [env: AOOX_URL] Dashboard URL (the address you open the dashboard with, e.g.
                       https://dashboard.example.com); defaults to the value from `aoox login`

DESCRIPTION
  Save the dashboard address and API token for other commands (the API address is discovered automatically)

EXAMPLES
  $ aoox login

  $ aoox login --url https://dashboard.example.com --token aoox_xxx

  $ aoox login --url 203.0.113.10:3000 --token aoox_xxx
```

_See code: [src/commands/login.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.12/src/commands/login.ts)_

## `aoox plugins`

List installed plugins.

```
USAGE
  $ aoox plugins [--json] [--core]

FLAGS
  --core  Show core plugins.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  List installed plugins.

EXAMPLES
  $ aoox plugins
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/5.5.2/src/commands/plugins/index.ts)_

## `aoox plugins add PLUGIN`

Installs a plugin into aoox.

```
USAGE
  $ aoox plugins add PLUGIN... [--json] [-f] [-h] [-s | -v]

ARGUMENTS
  PLUGIN...  Plugin to install.

FLAGS
  -f, --force    Force npm to fetch remote resources even if a local copy exists on disk.
  -h, --help     Show CLI help.
  -s, --silent   Silences npm output.
  -v, --verbose  Show verbose npm output.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Installs a plugin into aoox.

  Uses npm to install plugins.

  Installation of a user-installed plugin will override a core plugin.

  Use the AOOX_NPM_LOG_LEVEL environment variable to set the npm loglevel.
  Use the AOOX_NPM_REGISTRY environment variable to set the npm registry.

ALIASES
  $ aoox plugins add

EXAMPLES
  Install a plugin from npm registry.

    $ aoox plugins add myplugin

  Install a plugin from a github url.

    $ aoox plugins add https://github.com/someuser/someplugin

  Install a plugin from a github slug.

    $ aoox plugins add someuser/someplugin
```

## `aoox plugins:inspect PLUGIN...`

Displays installation properties of a plugin.

```
USAGE
  $ aoox plugins inspect PLUGIN...

ARGUMENTS
  PLUGIN...  [default: .] Plugin to inspect.

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Displays installation properties of a plugin.

EXAMPLES
  $ aoox plugins inspect myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/5.5.2/src/commands/plugins/inspect.ts)_

## `aoox plugins install PLUGIN`

Installs a plugin into aoox.

```
USAGE
  $ aoox plugins install PLUGIN... [--json] [-f] [-h] [-s | -v]

ARGUMENTS
  PLUGIN...  Plugin to install.

FLAGS
  -f, --force    Force npm to fetch remote resources even if a local copy exists on disk.
  -h, --help     Show CLI help.
  -s, --silent   Silences npm output.
  -v, --verbose  Show verbose npm output.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Installs a plugin into aoox.

  Uses npm to install plugins.

  Installation of a user-installed plugin will override a core plugin.

  Use the AOOX_NPM_LOG_LEVEL environment variable to set the npm loglevel.
  Use the AOOX_NPM_REGISTRY environment variable to set the npm registry.

ALIASES
  $ aoox plugins add

EXAMPLES
  Install a plugin from npm registry.

    $ aoox plugins install myplugin

  Install a plugin from a github url.

    $ aoox plugins install https://github.com/someuser/someplugin

  Install a plugin from a github slug.

    $ aoox plugins install someuser/someplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/5.5.2/src/commands/plugins/install.ts)_

## `aoox plugins link PATH`

Links a plugin into the CLI for development.

```
USAGE
  $ aoox plugins link PATH [-h] [--install] [-v]

ARGUMENTS
  PATH  [default: .] path to plugin

FLAGS
  -h, --help          Show CLI help.
  -v, --verbose
      --[no-]install  Install dependencies after linking the plugin.

DESCRIPTION
  Links a plugin into the CLI for development.

  Installation of a linked plugin will override a user-installed or core plugin.

  e.g. If you have a user-installed or core plugin that has a 'hello' command, installing a linked plugin with a 'hello'
  command will override the user-installed or core plugin implementation. This is useful for development work.


EXAMPLES
  $ aoox plugins link myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/5.5.2/src/commands/plugins/link.ts)_

## `aoox plugins remove [PLUGIN]`

Removes a plugin from the CLI.

```
USAGE
  $ aoox plugins remove [PLUGIN...] [-h] [-v]

ARGUMENTS
  [PLUGIN...]  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ aoox plugins unlink
  $ aoox plugins remove

EXAMPLES
  $ aoox plugins remove myplugin
```

## `aoox plugins reset`

Remove all user-installed and linked plugins.

```
USAGE
  $ aoox plugins reset [--hard] [--reinstall]

FLAGS
  --hard       Delete node_modules and package manager related files in addition to uninstalling plugins.
  --reinstall  Reinstall all plugins after uninstalling.
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/5.5.2/src/commands/plugins/reset.ts)_

## `aoox plugins uninstall [PLUGIN]`

Removes a plugin from the CLI.

```
USAGE
  $ aoox plugins uninstall [PLUGIN...] [-h] [-v]

ARGUMENTS
  [PLUGIN...]  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ aoox plugins unlink
  $ aoox plugins remove

EXAMPLES
  $ aoox plugins uninstall myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/5.5.2/src/commands/plugins/uninstall.ts)_

## `aoox plugins unlink [PLUGIN]`

Removes a plugin from the CLI.

```
USAGE
  $ aoox plugins unlink [PLUGIN...] [-h] [-v]

ARGUMENTS
  [PLUGIN...]  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ aoox plugins unlink
  $ aoox plugins remove

EXAMPLES
  $ aoox plugins unlink myplugin
```

## `aoox plugins update`

Update installed plugins.

```
USAGE
  $ aoox plugins update [-h] [-v]

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Update installed plugins.
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/5.5.2/src/commands/plugins/update.ts)_

## `aoox registry build [IMAGE]`

Build an image from a Dockerfile, named for the aoox registry (refuses a version that already exists there). A name or version you leave out is taken from the project (you confirm it first, or pass --yes)

```
USAGE
  $ aoox registry build [IMAGE] [-t <value>] [-u <value>] [--force] [--registry <value>] [-y] [--context <value>]
    [-f <value>] [--push]

ARGUMENTS
  [IMAGE]  Image name and version, e.g. myapp:1.0.0. Omit it (or the version) to read them from the project in the build
           context: package.json, pyproject.toml, Cargo.toml, composer.json, pubspec.yaml, *.csproj, pom.xml, a VERSION
           file or a git tag

FLAGS
  -f, --dockerfile=<value>  [default: Dockerfile] Path to the Dockerfile
  -t, --token=<value>       [env: AOOX_TOKEN] API token (aoox_…); defaults to the value from `aoox login`
  -u, --url=<value>         [env: AOOX_URL] Dashboard URL (the address you open the dashboard with, e.g.
                            https://dashboard.example.com); defaults to the value from `aoox login`
  -y, --yes                 Do not ask to confirm an image name or version taken from the project
      --context=<value>     [default: .] Docker build context
      --force               Overwrite a version that already exists in the registry (also lets a version be taken from a
                            git tag HEAD is past)
      --push                Push the image to the registry right after the build
      --registry=<value>    Registry ID; defaults to the self-hosted registry

DESCRIPTION
  Build an image from a Dockerfile, named for the aoox registry (refuses a version that already exists there). A name or
  version you leave out is taken from the project (you confirm it first, or pass --yes)

EXAMPLES
  $ aoox registry build myapp:1.0.0

  $ aoox registry build --push

  $ aoox registry build myapp --context ./app

  $ aoox registry build --push --yes

  $ aoox registry build myapp:1.0.0 --push

  $ aoox registry build team/api:2.1.0 -f docker/Dockerfile --context .

  $ aoox registry build myapp:1.0.0 --force
```

_See code: [src/commands/registry/build.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.12/src/commands/registry/build.ts)_

## `aoox registry domain`

Set or remove the custom domain for the self-hosted registry

```
USAGE
  $ aoox registry domain [-t <value>] [-u <value>] [--clear] [--set <value>]

FLAGS
  -t, --token=<value>  [env: AOOX_TOKEN] API token (aoox_…); defaults to the value from `aoox login`
  -u, --url=<value>    [env: AOOX_URL] Dashboard URL (the address you open the dashboard with, e.g.
                       https://dashboard.example.com); defaults to the value from `aoox login`
      --clear          Remove the domain, falling back to host:port
      --set=<value>    Domain for the self-hosted registry

DESCRIPTION
  Set or remove the custom domain for the self-hosted registry

EXAMPLES
  $ aoox registry domain --set registry.example.com

  $ aoox registry domain --clear
```

_See code: [src/commands/registry/domain.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.12/src/commands/registry/domain.ts)_

## `aoox registry push [IMAGE]`

Push a local image to the aoox registry (refuses a version that already exists there). A name or version you leave out is taken from the project (you confirm it first, or pass --yes)

```
USAGE
  $ aoox registry push [IMAGE] [-t <value>] [-u <value>] [--force] [--registry <value>] [-y]

ARGUMENTS
  [IMAGE]  Image name and version (short or full), e.g. myapp:1.0.0. Omit it (or the version) to read them from the
           project in the current directory: package.json, pyproject.toml, Cargo.toml, composer.json, pubspec.yaml,
           *.csproj, pom.xml, a VERSION file or a git tag

FLAGS
  -t, --token=<value>     [env: AOOX_TOKEN] API token (aoox_…); defaults to the value from `aoox login`
  -u, --url=<value>       [env: AOOX_URL] Dashboard URL (the address you open the dashboard with, e.g.
                          https://dashboard.example.com); defaults to the value from `aoox login`
  -y, --yes               Do not ask to confirm an image name or version taken from the project
      --force             Overwrite a version that already exists in the registry (also lets a version be taken from a
                          git tag HEAD is past)
      --registry=<value>  Registry ID; defaults to the self-hosted registry

DESCRIPTION
  Push a local image to the aoox registry (refuses a version that already exists there). A name or version you leave out
  is taken from the project (you confirm it first, or pass --yes)

EXAMPLES
  $ aoox registry push myapp:1.0.0

  $ aoox registry push

  $ aoox registry push myapp

  $ aoox registry push registry.example.com/myapp:1.0.0

  $ aoox registry push myapp:1.0.0 --force
```

_See code: [src/commands/registry/push.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.12/src/commands/registry/push.ts)_

## `aoox reinstall`

Repair/refresh an existing aoox installation without losing data: rewrite compose, merge .env.dist (secrets are never regenerated), then pull + recreate

```
USAGE
  $ aoox reinstall [--dir <value>] [--dry-run] [--no-pull] [--terminal-ssh-user <value>] [-y]

FLAGS
  -y, --yes                        Do not ask for confirmation
      --dir=<value>                [default: /opt/aoox] Installation directory
      --dry-run                    Print the plan (changed files, keys to add, compose commands) without changing
                                   anything
      --no-pull                    Skip docker compose pull (use the images already present)
      --terminal-ssh-user=<value>  Set/overwrite TERMINAL_SSH_USER in .env.dist during repair

DESCRIPTION
  Repair/refresh an existing aoox installation without losing data: rewrite compose, merge .env.dist (secrets are never
  regenerated), then pull + recreate

EXAMPLES
  sudo aoox reinstall --dry-run

  sudo aoox reinstall

  sudo aoox reinstall --yes --terminal-ssh-user root
```

_See code: [src/commands/reinstall.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.12/src/commands/reinstall.ts)_

## `aoox run`

Run a command with the variables the linked application gets at deploy time, without writing them to disk: its linked variable set environments in order (a later one wins), then its own env on top. With --set/--env, exactly one set environment instead. Put the command after `--`; its exit code is forwarded. Before the command starts, one line on stderr says how many variables aoox injects and from which layers (colour only on a terminal; NO_COLOR turns it off, FORCE_COLOR forces it); --quiet hides it, but never the warnings. Every read is recorded in the audit log

```
USAGE
  $ aoox run [-t <value>] [-u <value>] [--stack <value> | --app <value>] [-e <value>] [-s <value>]
    [--file <value>] [-q]

FLAGS
  -e, --env=<value>    Environment of the set (e.g. development, staging, production). Default: the only environment of
                       the set the linked application links
  -q, --quiet          Do not print the "Injecting N variables" line or the informational notes. Warnings about
                       unresolved references and excluded Infisical secrets are always printed
  -s, --set=<value>    Variable set slug (or name). Default: the only set the linked application links, or the only set
                       you can see
  -t, --token=<value>  [env: AOOX_TOKEN] API token (aoox_…); defaults to the value from `aoox login`
  -u, --url=<value>    [env: AOOX_URL] Dashboard URL (the address you open the dashboard with, e.g.
                       https://dashboard.example.com); defaults to the value from `aoox login`
      --app=<value>    Application ID; defaults to the application linked with `aoox link`
      --file=<value>   A local .env file layered on top (it wins over aoox, which wins over the current environment).
                       Only read, never written
      --stack=<value>  Compose stack ID, instead of an application

DESCRIPTION
  Run a command with the variables the linked application gets at deploy time, without writing them to disk: its linked
  variable set environments in order (a later one wins), then its own env on top. With --set/--env, exactly one set
  environment instead. Put the command after `--`; its exit code is forwarded. Before the command starts, one line on
  stderr says how many variables aoox injects and from which layers (colour only on a terminal; NO_COLOR turns it off,
  FORCE_COLOR forces it); --quiet hides it, but never the warnings. Every read is recorded in the audit log

EXAMPLES
  $ aoox run -- npm run dev

  $ aoox run --set shared --env staging -- node server.js

  $ aoox run --file .env.local -- npm run dev

  $ aoox run --stack <id> -- docker compose config

  $ aoox run --quiet -- npm run dev
```

_See code: [src/commands/run.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.12/src/commands/run.ts)_

## `aoox update`

Update the aoox CLI itself (use `aoox update panel` to update the panel)

```
USAGE
  $ aoox update [--check]

FLAGS
  --check  Only report whether a newer version exists; change nothing

DESCRIPTION
  Update the aoox CLI itself (use `aoox update panel` to update the panel)

EXAMPLES
  $ aoox update

  $ aoox update --check
```

_See code: [src/commands/update.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.12/src/commands/update.ts)_

## `aoox update panel`

Check for or apply updates to the aoox panel itself (the aoox-api and aoox-web images)

```
USAGE
  $ aoox update panel [-t <value>] [-u <value>] [--apply]

FLAGS
  -t, --token=<value>  [env: AOOX_TOKEN] API token (aoox_…); defaults to the value from `aoox login`
  -u, --url=<value>    [env: AOOX_URL] Dashboard URL (the address you open the dashboard with, e.g.
                       https://dashboard.example.com); defaults to the value from `aoox login`
      --apply          Apply the update if one is available (pull + restart)

DESCRIPTION
  Check for or apply updates to the aoox panel itself (the aoox-api and aoox-web images)

EXAMPLES
  $ aoox update panel

  $ aoox update panel --apply
```

_See code: [src/commands/update/panel.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.12/src/commands/update/panel.ts)_

## `aoox whoami`

Show the account and panel in use

```
USAGE
  $ aoox whoami [--json] [-t <value>] [-u <value>]

FLAGS
  -t, --token=<value>  [env: AOOX_TOKEN] API token (aoox_…); defaults to the value from `aoox login`
  -u, --url=<value>    [env: AOOX_URL] Dashboard URL (the address you open the dashboard with, e.g.
                       https://dashboard.example.com); defaults to the value from `aoox login`

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Show the account and panel in use

EXAMPLES
  $ aoox whoami

  $ aoox whoami --json
```

_See code: [src/commands/whoami.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.12/src/commands/whoami.ts)_
<!-- commandsstop -->
* [`aoox deploy`](#aoox-deploy)
* [`aoox domain clear`](#aoox-domain-clear)
* [`aoox domain set`](#aoox-domain-set)
* [`aoox env diff`](#aoox-env-diff)
* [`aoox env history`](#aoox-env-history)
* [`aoox env link`](#aoox-env-link)
* [`aoox env links`](#aoox-env-links)
* [`aoox env list`](#aoox-env-list)
* [`aoox env promote`](#aoox-env-promote)
* [`aoox env pull`](#aoox-env-pull)
* [`aoox env push`](#aoox-env-push)
* [`aoox env set ASSIGNMENTS`](#aoox-env-set-assignments)
* [`aoox env sets`](#aoox-env-sets)
* [`aoox env unlink`](#aoox-env-unlink)
* [`aoox env unset KEYS`](#aoox-env-unset-keys)
* [`aoox help [COMMAND]`](#aoox-help-command)
* [`aoox install`](#aoox-install)
* [`aoox link`](#aoox-link)
* [`aoox login`](#aoox-login)
* [`aoox plugins`](#aoox-plugins)
* [`aoox plugins add PLUGIN`](#aoox-plugins-add-plugin)
* [`aoox plugins:inspect PLUGIN...`](#aoox-pluginsinspect-plugin)
* [`aoox plugins install PLUGIN`](#aoox-plugins-install-plugin)
* [`aoox plugins link PATH`](#aoox-plugins-link-path)
* [`aoox plugins remove [PLUGIN]`](#aoox-plugins-remove-plugin)
* [`aoox plugins reset`](#aoox-plugins-reset)
* [`aoox plugins uninstall [PLUGIN]`](#aoox-plugins-uninstall-plugin)
* [`aoox plugins unlink [PLUGIN]`](#aoox-plugins-unlink-plugin)
* [`aoox plugins update`](#aoox-plugins-update)
* [`aoox registry build [IMAGE]`](#aoox-registry-build-image)
* [`aoox registry domain`](#aoox-registry-domain)
* [`aoox registry push [IMAGE]`](#aoox-registry-push-image)
* [`aoox reinstall`](#aoox-reinstall)
* [`aoox run`](#aoox-run)
* [`aoox update`](#aoox-update)
* [`aoox update panel`](#aoox-update-panel)
* [`aoox whoami`](#aoox-whoami)

## `aoox deploy`

Build a local image, push it to the aoox registry, then deploy (the repo must be linked with `aoox link` first)

```
USAGE
  $ aoox deploy [-t <value>] [-u <value>] [--context <value>] [-f <value>] [--registry <value>] [--tag
    <value>]

FLAGS
  -f, --dockerfile=<value>  [default: Dockerfile] Path to the Dockerfile
  -t, --token=<value>       [env: AOOX_TOKEN] API token (aoox_…); defaults to the value from `aoox login`
  -u, --url=<value>         [env: AOOX_URL] Dashboard URL (the address you open the dashboard with, e.g.
                            https://dashboard.example.com); defaults to the value from `aoox login`
      --context=<value>     [default: .] Docker build context
      --registry=<value>    Registry ID to push to; defaults to the self-hosted registry
      --tag=<value>         Image tag; defaults to the git short SHA (+ -dirty)

DESCRIPTION
  Build a local image, push it to the aoox registry, then deploy (the repo must be linked with `aoox link` first)

EXAMPLES
  $ aoox deploy

  $ aoox deploy --tag v1.2.3
```

_See code: [src/commands/deploy.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.11/src/commands/deploy.ts)_

## `aoox domain clear`

Remove the custom domain of the panel itself and go back to IP access (IP:3000) through the running panel API

```
USAGE
  $ aoox domain clear [-t <value>] [-u <value>] [-y]

FLAGS
  -t, --token=<value>  [env: AOOX_TOKEN] API token (aoox_…); defaults to the value from `aoox login`
  -u, --url=<value>    [env: AOOX_URL] Dashboard URL (the address you open the dashboard with, e.g.
                       https://dashboard.example.com); defaults to the value from `aoox login`
  -y, --yes            Do not ask for confirmation

DESCRIPTION
  Remove the custom domain of the panel itself and go back to IP access (IP:3000) through the running panel API

EXAMPLES
  $ aoox domain clear

  $ aoox domain clear --yes
```

_See code: [src/commands/domain/clear.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.11/src/commands/domain/clear.ts)_

## `aoox domain set`

Set a custom domain for the panel itself (not an application) through the running panel API

```
USAGE
  $ aoox domain set --api <value> --web <value> [-t <value>] [-u <value>] [--acme-email <value>] [--domain-only]

FLAGS
  -t, --token=<value>       [env: AOOX_TOKEN] API token (aoox_…); defaults to the value from `aoox login`
  -u, --url=<value>         [env: AOOX_URL] Dashboard URL (the address you open the dashboard with, e.g.
                            https://dashboard.example.com); defaults to the value from `aoox login`
      --acme-email=<value>  Email for the Let's Encrypt certificate
      --api=<value>         (required) Domain for the panel API
      --[no-]domain-only    Only allow access through the domain: ports 3000/3001 listen on 127.0.0.1 only (default:
                            keep the current setting). Use --no-domain-only to open them again. Make sure the domain
                            works first, or you lose IP:port access
      --web=<value>         (required) Domain for the panel dashboard

DESCRIPTION
  Set a custom domain for the panel itself (not an application) through the running panel API

EXAMPLES
  $ aoox domain set --web panel.example.com --api api.example.com

  $ aoox domain set --web panel.example.com --api api.example.com --acme-email you@example.com

  $ aoox domain set --web panel.example.com --api api.example.com --domain-only
```

_See code: [src/commands/domain/set.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.11/src/commands/domain/set.ts)_

## `aoox env diff`

Compare two environments of a variable set key by key: which variables exist on one side only and which have different values. Prints names only, never values

```
USAGE
  $ aoox env diff --from <value> --to <value> [--json] [-t <value>] [-u <value>] [--stack <value> | --app
    <value>] [-s <value>]

FLAGS
  -s, --set=<value>    Variable set slug (or name). Default: the only set the linked application links, or the only set
                       you can see
  -t, --token=<value>  [env: AOOX_TOKEN] API token (aoox_…); defaults to the value from `aoox login`
  -u, --url=<value>    [env: AOOX_URL] Dashboard URL (the address you open the dashboard with, e.g.
                       https://dashboard.example.com); defaults to the value from `aoox login`
      --app=<value>    Application ID; defaults to the application linked with `aoox link`
      --from=<value>   (required) Environment to compare from
      --stack=<value>  Compose stack ID, instead of an application
      --to=<value>     (required) Environment to compare to

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Compare two environments of a variable set key by key: which variables exist on one side only and which have different
  values. Prints names only, never values

EXAMPLES
  $ aoox env diff --set shared --from staging --to production
```

_See code: [src/commands/env/diff.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.11/src/commands/env/diff.ts)_

## `aoox env history`

Show the version history of a variable set environment: when, who, and which variable names were added (+), changed (~) or removed (-). Values are never shown

```
USAGE
  $ aoox env history [--json] [-t <value>] [-u <value>] [--stack <value> | --app <value>] [-e <value>] [-s
    <value>] [--limit <value>]

FLAGS
  -e, --env=<value>    Environment of the set (e.g. development, staging, production). Default: the only environment of
                       the set the linked application links
  -s, --set=<value>    Variable set slug (or name). Default: the only set the linked application links, or the only set
                       you can see
  -t, --token=<value>  [env: AOOX_TOKEN] API token (aoox_…); defaults to the value from `aoox login`
  -u, --url=<value>    [env: AOOX_URL] Dashboard URL (the address you open the dashboard with, e.g.
                       https://dashboard.example.com); defaults to the value from `aoox login`
      --app=<value>    Application ID; defaults to the application linked with `aoox link`
      --limit=<value>  [default: 20] How many versions to show (newest first)
      --stack=<value>  Compose stack ID, instead of an application

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Show the version history of a variable set environment: when, who, and which variable names were added (+), changed
  (~) or removed (-). Values are never shown

EXAMPLES
  $ aoox env history --set shared --env production

  $ aoox env history --limit 5 --json
```

_See code: [src/commands/env/history.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.11/src/commands/env/history.ts)_

## `aoox env link`

Link a variable set environment to the linked application (or --stack). It is added last, so it wins over the other links, unless --position is given; an environment that is already linked is moved. Takes effect on the next deploy

```
USAGE
  $ aoox env link -e <value> -s <value> [--json] [-t <value>] [-u <value>] [--stack <value> | --app <value>]
    [--position <value>]

FLAGS
  -e, --env=<value>       (required) Environment of the set
  -s, --set=<value>       (required) Variable set slug (or name)
  -t, --token=<value>     [env: AOOX_TOKEN] API token (aoox_…); defaults to the value from `aoox login`
  -u, --url=<value>       [env: AOOX_URL] Dashboard URL (the address you open the dashboard with, e.g.
                          https://dashboard.example.com); defaults to the value from `aoox login`
      --app=<value>       Application ID; defaults to the application linked with `aoox link`
      --position=<value>  1-based place in the list (1 = first, overridden by every later link). Default: last
      --stack=<value>     Compose stack ID, instead of an application

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Link a variable set environment to the linked application (or --stack). It is added last, so it wins over the other
  links, unless --position is given; an environment that is already linked is moved. Takes effect on the next deploy

EXAMPLES
  $ aoox env link --set shared --env production

  $ aoox env link --set defaults --env production --position 1
```

_See code: [src/commands/env/link.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.11/src/commands/env/link.ts)_

## `aoox env links`

Show the variable set environments the linked application (or --stack) uses, in merge order, with the variables a later link or the own env overrides

```
USAGE
  $ aoox env links [--json] [-t <value>] [-u <value>] [--stack <value> | --app <value>]

FLAGS
  -t, --token=<value>  [env: AOOX_TOKEN] API token (aoox_…); defaults to the value from `aoox login`
  -u, --url=<value>    [env: AOOX_URL] Dashboard URL (the address you open the dashboard with, e.g.
                       https://dashboard.example.com); defaults to the value from `aoox login`
      --app=<value>    Application ID; defaults to the application linked with `aoox link`
      --stack=<value>  Compose stack ID, instead of an application

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Show the variable set environments the linked application (or --stack) uses, in merge order, with the variables a
  later link or the own env overrides

EXAMPLES
  $ aoox env links

  $ aoox env links --stack <id>
```

_See code: [src/commands/env/links.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.11/src/commands/env/links.ts)_

## `aoox env list`

List the variable sets you can see and their environments (with --set: one set; with --env: the variable names of one environment). Values are masked unless --reveal is given

```
USAGE
  $ aoox env list [--json] [-t <value>] [-u <value>] [--stack <value> | --app <value>] [-e <value>] [--reveal]
    [-s <value>]

FLAGS
  -e, --env=<value>    Environment name; lists its variable names (the set defaults like in the other env commands)
  -s, --set=<value>    Variable set slug (or name). Default: the only set the linked application links, or the only set
                       you can see
  -t, --token=<value>  [env: AOOX_TOKEN] API token (aoox_…); defaults to the value from `aoox login`
  -u, --url=<value>    [env: AOOX_URL] Dashboard URL (the address you open the dashboard with, e.g.
                       https://dashboard.example.com); defaults to the value from `aoox login`
      --app=<value>    Application ID; defaults to the application linked with `aoox link`
      --reveal         Show the values (needs --env; the read is recorded in the audit log)
      --stack=<value>  Compose stack ID, instead of an application

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  List the variable sets you can see and their environments (with --set: one set; with --env: the variable names of one
  environment). Values are masked unless --reveal is given

ALIASES
  $ aoox env sets

EXAMPLES
  $ aoox env list

  $ aoox env list --set shared

  $ aoox env list --set shared --env staging

  $ aoox env list --set shared --env development --reveal
```

_See code: [src/commands/env/list.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.11/src/commands/env/list.ts)_

## `aoox env promote`

Copy variables (and their secret flag) from one environment of a variable set to another (name them, or use --all). Needs the right to read the source and to change the target. The target keeps its comments and order; new variables are appended. Shows what changes and asks before writing (unless --yes)

```
USAGE
  $ aoox env promote --from <value> --to <value> [-t <value>] [-u <value>] [--stack <value> | --app <value>]
    [--all] [-s <value>] [-y]

FLAGS
  -s, --set=<value>    Variable set slug (or name). Default: the only set the linked application links, or the only set
                       you can see
  -t, --token=<value>  [env: AOOX_TOKEN] API token (aoox_…); defaults to the value from `aoox login`
  -u, --url=<value>    [env: AOOX_URL] Dashboard URL (the address you open the dashboard with, e.g.
                       https://dashboard.example.com); defaults to the value from `aoox login`
  -y, --yes            Do not ask for confirmation
      --all            Promote every variable of the source (those already equal are skipped)
      --app=<value>    Application ID; defaults to the application linked with `aoox link`
      --from=<value>   (required) Environment to copy the values from
      --stack=<value>  Compose stack ID, instead of an application
      --to=<value>     (required) Environment to copy the values into

DESCRIPTION
  Copy variables (and their secret flag) from one environment of a variable set to another (name them, or use --all).
  Needs the right to read the source and to change the target. The target keeps its comments and order; new variables
  are appended. Shows what changes and asks before writing (unless --yes)

EXAMPLES
  $ aoox env promote --set shared --from staging --to production API_URL FEATURE_X

  $ aoox env promote --from development --to staging --all --yes
```

_See code: [src/commands/env/promote.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.11/src/commands/env/promote.ts)_

## `aoox env pull`

Write the variables of a variable set environment to a local file (mode 0600), or to standard output with --file -. Refuses to overwrite unless --force. The read is recorded in the audit log

```
USAGE
  $ aoox env pull [-t <value>] [-u <value>] [--stack <value> | --app <value>] [-e <value>] [-s <value>]
    [--file <value>] [--force] [--format dotenv|json|shell]

FLAGS
  -e, --env=<value>      Environment of the set (e.g. development, staging, production). Default: the only environment
                         of the set the linked application links
  -s, --set=<value>      Variable set slug (or name). Default: the only set the linked application links, or the only
                         set you can see
  -t, --token=<value>    [env: AOOX_TOKEN] API token (aoox_…); defaults to the value from `aoox login`
  -u, --url=<value>      [env: AOOX_URL] Dashboard URL (the address you open the dashboard with, e.g.
                         https://dashboard.example.com); defaults to the value from `aoox login`
      --app=<value>      Application ID; defaults to the application linked with `aoox link`
      --file=<value>     File to write, relative to the current folder; "-" writes to standard output (nothing else is
                         printed there). Default: .env, .env.json or .env.sh by format
      --force            Overwrite the file if it exists
      --format=<option>  [default: dotenv] dotenv (the stored text, comments kept), json ({"KEY":"value"}) or shell
                         (export KEY='value' lines for eval)
                         <options: dotenv|json|shell>
      --stack=<value>    Compose stack ID, instead of an application

DESCRIPTION
  Write the variables of a variable set environment to a local file (mode 0600), or to standard output with --file -.
  Refuses to overwrite unless --force. The read is recorded in the audit log

EXAMPLES
  $ aoox env pull

  $ aoox env pull --set shared --env staging --file .env.staging

  $ aoox env pull --force

  $ aoox env pull --format json --file -

  $ aoox env pull --format shell --file -
```

_See code: [src/commands/env/pull.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.11/src/commands/env/pull.ts)_

## `aoox env push`

Replace the whole text of a variable set environment with a local .env file. Shows what is added, changed and removed and asks before writing (unless --yes); the write fails if someone else changed the environment in between

```
USAGE
  $ aoox env push --file <value> [-t <value>] [-u <value>] [--stack <value> | --app <value>] [-e <value>] [-s
    <value>] [-y]

FLAGS
  -e, --env=<value>    Environment of the set (e.g. development, staging, production). Default: the only environment of
                       the set the linked application links
  -s, --set=<value>    Variable set slug (or name). Default: the only set the linked application links, or the only set
                       you can see
  -t, --token=<value>  [env: AOOX_TOKEN] API token (aoox_…); defaults to the value from `aoox login`
  -u, --url=<value>    [env: AOOX_URL] Dashboard URL (the address you open the dashboard with, e.g.
                       https://dashboard.example.com); defaults to the value from `aoox login`
  -y, --yes            Do not ask for confirmation
      --app=<value>    Application ID; defaults to the application linked with `aoox link`
      --file=<value>   (required) The .env file to upload
      --stack=<value>  Compose stack ID, instead of an application

DESCRIPTION
  Replace the whole text of a variable set environment with a local .env file. Shows what is added, changed and removed
  and asks before writing (unless --yes); the write fails if someone else changed the environment in between

EXAMPLES
  $ aoox env push --file .env

  $ aoox env push --file .env.staging --set shared --env staging --yes
```

_See code: [src/commands/env/push.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.11/src/commands/env/push.ts)_

## `aoox env set ASSIGNMENTS`

Set one or more variables in a variable set environment. Existing comments and order are kept; the write fails if someone else changed the environment in between

```
USAGE
  $ aoox env set ASSIGNMENTS... [-t <value>] [-u <value>] [--stack <value> | --app <value>] [-e <value>] [-s
    <value>] [--secret]

ARGUMENTS
  ASSIGNMENTS...  KEY=VALUE (the value is stored exactly as given)

FLAGS
  -e, --env=<value>    Environment of the set (e.g. development, staging, production). Default: the only environment of
                       the set the linked application links
  -s, --set=<value>    Variable set slug (or name). Default: the only set the linked application links, or the only set
                       you can see
  -t, --token=<value>  [env: AOOX_TOKEN] API token (aoox_…); defaults to the value from `aoox login`
  -u, --url=<value>    [env: AOOX_URL] Dashboard URL (the address you open the dashboard with, e.g.
                       https://dashboard.example.com); defaults to the value from `aoox login`
      --app=<value>    Application ID; defaults to the application linked with `aoox link`
      --[no-]secret    Mark the variables as secret (--secret: always masked in logs) or explicitly not secret
                       (--no-secret: never masked). Without either the flag is left as it is
      --stack=<value>  Compose stack ID, instead of an application

DESCRIPTION
  Set one or more variables in a variable set environment. Existing comments and order are kept; the write fails if
  someone else changed the environment in between

EXAMPLES
  $ aoox env set API_URL=https://api.example.com --set shared --env production

  $ aoox env set GREETING="hello world" QUERY=a=b --env staging

  $ aoox env set API_TOKEN=abc123 --secret
```

_See code: [src/commands/env/set.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.11/src/commands/env/set.ts)_

## `aoox env sets`

List the variable sets you can see and their environments (with --set: one set; with --env: the variable names of one environment). Values are masked unless --reveal is given

```
USAGE
  $ aoox env sets [--json] [-t <value>] [-u <value>] [--stack <value> | --app <value>] [-e <value>] [--reveal]
    [-s <value>]

FLAGS
  -e, --env=<value>    Environment name; lists its variable names (the set defaults like in the other env commands)
  -s, --set=<value>    Variable set slug (or name). Default: the only set the linked application links, or the only set
                       you can see
  -t, --token=<value>  [env: AOOX_TOKEN] API token (aoox_…); defaults to the value from `aoox login`
  -u, --url=<value>    [env: AOOX_URL] Dashboard URL (the address you open the dashboard with, e.g.
                       https://dashboard.example.com); defaults to the value from `aoox login`
      --app=<value>    Application ID; defaults to the application linked with `aoox link`
      --reveal         Show the values (needs --env; the read is recorded in the audit log)
      --stack=<value>  Compose stack ID, instead of an application

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  List the variable sets you can see and their environments (with --set: one set; with --env: the variable names of one
  environment). Values are masked unless --reveal is given

ALIASES
  $ aoox env sets

EXAMPLES
  $ aoox env sets

  $ aoox env sets --set shared

  $ aoox env sets --set shared --env staging

  $ aoox env sets --set shared --env development --reveal
```

## `aoox env unlink`

Remove a variable set environment from the linked application (or --stack). Name it with --set and --env, or with its --position from `aoox env links`. Takes effect on the next deploy

```
USAGE
  $ aoox env unlink [--json] [-t <value>] [-u <value>] [--stack <value> | --app <value>] [--position <value> |
    -s <value> | -e <value>]

FLAGS
  -e, --env=<value>       Environment of the set
  -s, --set=<value>       Variable set slug (or name)
  -t, --token=<value>     [env: AOOX_TOKEN] API token (aoox_…); defaults to the value from `aoox login`
  -u, --url=<value>       [env: AOOX_URL] Dashboard URL (the address you open the dashboard with, e.g.
                          https://dashboard.example.com); defaults to the value from `aoox login`
      --app=<value>       Application ID; defaults to the application linked with `aoox link`
      --position=<value>  1-based position as shown by `aoox env links`
      --stack=<value>     Compose stack ID, instead of an application

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Remove a variable set environment from the linked application (or --stack). Name it with --set and --env, or with its
  --position from `aoox env links`. Takes effect on the next deploy

EXAMPLES
  $ aoox env unlink --set shared --env staging

  $ aoox env unlink --position 2
```

_See code: [src/commands/env/unlink.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.11/src/commands/env/unlink.ts)_

## `aoox env unset KEYS`

Remove one or more variables from a variable set environment. Comments and the other variables are kept; the write fails if someone else changed the environment in between

```
USAGE
  $ aoox env unset KEYS... [-t <value>] [-u <value>] [--stack <value> | --app <value>] [-e <value>] [-s <value>]

ARGUMENTS
  KEYS...  Variable name(s) to remove

FLAGS
  -e, --env=<value>    Environment of the set (e.g. development, staging, production). Default: the only environment of
                       the set the linked application links
  -s, --set=<value>    Variable set slug (or name). Default: the only set the linked application links, or the only set
                       you can see
  -t, --token=<value>  [env: AOOX_TOKEN] API token (aoox_…); defaults to the value from `aoox login`
  -u, --url=<value>    [env: AOOX_URL] Dashboard URL (the address you open the dashboard with, e.g.
                       https://dashboard.example.com); defaults to the value from `aoox login`
      --app=<value>    Application ID; defaults to the application linked with `aoox link`
      --stack=<value>  Compose stack ID, instead of an application

DESCRIPTION
  Remove one or more variables from a variable set environment. Comments and the other variables are kept; the write
  fails if someone else changed the environment in between

EXAMPLES
  $ aoox env unset OLD_KEY

  $ aoox env unset A B --set shared --env staging
```

_See code: [src/commands/env/unset.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.11/src/commands/env/unset.ts)_

## `aoox help [COMMAND]`

Display help for aoox.

```
USAGE
  $ aoox help [COMMAND...] [-n]

ARGUMENTS
  [COMMAND...]  Command to show help for.

FLAGS
  -n, --nested-commands  Include all nested commands in the output.

DESCRIPTION
  Display help for aoox.
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/6.3.0/src/commands/help.ts)_

## `aoox install`

Install aoox (postgres + api + web) on a fresh VPS with Docker Compose

```
USAGE
  $ aoox install [--acme-email <value>] [--admin-name <value> --admin-email <value>] [--admin-password
    <value> ] [--api-domain <value> --web-domain <value>] [--dir <value>] [--force] [--no-terminal-authorize]
    [--terminal-ssh-user <value>] [-y]

FLAGS
  -y, --yes                        Do not ask for any confirmation
      --acme-email=<value>         Required with --web-domain/--api-domain (Let’s Encrypt)
      --admin-email=<value>        Create the first owner without going through /setup in the browser
      --admin-name=<value>         Name of the first owner
      --admin-password=<value>     Password of the first owner (min. 8 characters)
      --api-domain=<value>         Domain for the API, served through the bundled proxy
      --dir=<value>                [default: /opt/aoox] Installation directory
      --force                      Overwrite an existing installation in --dir
      --no-terminal-authorize      Do not create/authorize the web Terminal SSH key automatically (do it in Settings >
                                   Terminal instead)
      --terminal-ssh-user=<value>  SSH user the web Terminal uses to log in to this host (default: the user running
                                   sudo, or root if there is none)
      --web-domain=<value>         Domain for the web panel, served through the bundled proxy

DESCRIPTION
  Install aoox (postgres + api + web) on a fresh VPS with Docker Compose

EXAMPLES
  sudo aoox install

  sudo aoox install --web-domain panel.example.com --api-domain api.panel.example.com --acme-email me@example.com
```

_See code: [src/commands/install.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.11/src/commands/install.ts)_

## `aoox link`

Link this folder to an application in the panel (used by `aoox deploy`, `aoox run` without `--set`/`--env`, and the `aoox env` defaults and links)

```
USAGE
  $ aoox link [-t <value>] [-u <value>] [--app <value>] [--project <value>]

FLAGS
  -t, --token=<value>    [env: AOOX_TOKEN] API token (aoox_…); defaults to the value from `aoox login`
  -u, --url=<value>      [env: AOOX_URL] Dashboard URL (the address you open the dashboard with, e.g.
                         https://dashboard.example.com); defaults to the value from `aoox login`
      --app=<value>      Application ID; skip the interactive selection
      --project=<value>  Project ID; skip the interactive selection

DESCRIPTION
  Link this folder to an application in the panel (used by `aoox deploy`, `aoox run` without `--set`/`--env`, and the
  `aoox env` defaults and links)

EXAMPLES
  $ aoox link

  $ aoox link --project <id> --app <id>
```

_See code: [src/commands/link.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.11/src/commands/link.ts)_

## `aoox login`

Save the dashboard address and API token for other commands (the API address is discovered automatically)

```
USAGE
  $ aoox login [-t <value>] [-u <value>]

FLAGS
  -t, --token=<value>  [env: AOOX_TOKEN] API token (aoox_…); defaults to the value from `aoox login`
  -u, --url=<value>    [env: AOOX_URL] Dashboard URL (the address you open the dashboard with, e.g.
                       https://dashboard.example.com); defaults to the value from `aoox login`

DESCRIPTION
  Save the dashboard address and API token for other commands (the API address is discovered automatically)

EXAMPLES
  $ aoox login

  $ aoox login --url https://dashboard.example.com --token aoox_xxx

  $ aoox login --url 203.0.113.10:3000 --token aoox_xxx
```

_See code: [src/commands/login.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.11/src/commands/login.ts)_

## `aoox plugins`

List installed plugins.

```
USAGE
  $ aoox plugins [--json] [--core]

FLAGS
  --core  Show core plugins.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  List installed plugins.

EXAMPLES
  $ aoox plugins
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/5.5.2/src/commands/plugins/index.ts)_

## `aoox plugins add PLUGIN`

Installs a plugin into aoox.

```
USAGE
  $ aoox plugins add PLUGIN... [--json] [-f] [-h] [-s | -v]

ARGUMENTS
  PLUGIN...  Plugin to install.

FLAGS
  -f, --force    Force npm to fetch remote resources even if a local copy exists on disk.
  -h, --help     Show CLI help.
  -s, --silent   Silences npm output.
  -v, --verbose  Show verbose npm output.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Installs a plugin into aoox.

  Uses npm to install plugins.

  Installation of a user-installed plugin will override a core plugin.

  Use the AOOX_NPM_LOG_LEVEL environment variable to set the npm loglevel.
  Use the AOOX_NPM_REGISTRY environment variable to set the npm registry.

ALIASES
  $ aoox plugins add

EXAMPLES
  Install a plugin from npm registry.

    $ aoox plugins add myplugin

  Install a plugin from a github url.

    $ aoox plugins add https://github.com/someuser/someplugin

  Install a plugin from a github slug.

    $ aoox plugins add someuser/someplugin
```

## `aoox plugins:inspect PLUGIN...`

Displays installation properties of a plugin.

```
USAGE
  $ aoox plugins inspect PLUGIN...

ARGUMENTS
  PLUGIN...  [default: .] Plugin to inspect.

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Displays installation properties of a plugin.

EXAMPLES
  $ aoox plugins inspect myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/5.5.2/src/commands/plugins/inspect.ts)_

## `aoox plugins install PLUGIN`

Installs a plugin into aoox.

```
USAGE
  $ aoox plugins install PLUGIN... [--json] [-f] [-h] [-s | -v]

ARGUMENTS
  PLUGIN...  Plugin to install.

FLAGS
  -f, --force    Force npm to fetch remote resources even if a local copy exists on disk.
  -h, --help     Show CLI help.
  -s, --silent   Silences npm output.
  -v, --verbose  Show verbose npm output.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Installs a plugin into aoox.

  Uses npm to install plugins.

  Installation of a user-installed plugin will override a core plugin.

  Use the AOOX_NPM_LOG_LEVEL environment variable to set the npm loglevel.
  Use the AOOX_NPM_REGISTRY environment variable to set the npm registry.

ALIASES
  $ aoox plugins add

EXAMPLES
  Install a plugin from npm registry.

    $ aoox plugins install myplugin

  Install a plugin from a github url.

    $ aoox plugins install https://github.com/someuser/someplugin

  Install a plugin from a github slug.

    $ aoox plugins install someuser/someplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/5.5.2/src/commands/plugins/install.ts)_

## `aoox plugins link PATH`

Links a plugin into the CLI for development.

```
USAGE
  $ aoox plugins link PATH [-h] [--install] [-v]

ARGUMENTS
  PATH  [default: .] path to plugin

FLAGS
  -h, --help          Show CLI help.
  -v, --verbose
      --[no-]install  Install dependencies after linking the plugin.

DESCRIPTION
  Links a plugin into the CLI for development.

  Installation of a linked plugin will override a user-installed or core plugin.

  e.g. If you have a user-installed or core plugin that has a 'hello' command, installing a linked plugin with a 'hello'
  command will override the user-installed or core plugin implementation. This is useful for development work.


EXAMPLES
  $ aoox plugins link myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/5.5.2/src/commands/plugins/link.ts)_

## `aoox plugins remove [PLUGIN]`

Removes a plugin from the CLI.

```
USAGE
  $ aoox plugins remove [PLUGIN...] [-h] [-v]

ARGUMENTS
  [PLUGIN...]  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ aoox plugins unlink
  $ aoox plugins remove

EXAMPLES
  $ aoox plugins remove myplugin
```

## `aoox plugins reset`

Remove all user-installed and linked plugins.

```
USAGE
  $ aoox plugins reset [--hard] [--reinstall]

FLAGS
  --hard       Delete node_modules and package manager related files in addition to uninstalling plugins.
  --reinstall  Reinstall all plugins after uninstalling.
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/5.5.2/src/commands/plugins/reset.ts)_

## `aoox plugins uninstall [PLUGIN]`

Removes a plugin from the CLI.

```
USAGE
  $ aoox plugins uninstall [PLUGIN...] [-h] [-v]

ARGUMENTS
  [PLUGIN...]  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ aoox plugins unlink
  $ aoox plugins remove

EXAMPLES
  $ aoox plugins uninstall myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/5.5.2/src/commands/plugins/uninstall.ts)_

## `aoox plugins unlink [PLUGIN]`

Removes a plugin from the CLI.

```
USAGE
  $ aoox plugins unlink [PLUGIN...] [-h] [-v]

ARGUMENTS
  [PLUGIN...]  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ aoox plugins unlink
  $ aoox plugins remove

EXAMPLES
  $ aoox plugins unlink myplugin
```

## `aoox plugins update`

Update installed plugins.

```
USAGE
  $ aoox plugins update [-h] [-v]

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Update installed plugins.
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/5.5.2/src/commands/plugins/update.ts)_

## `aoox registry build [IMAGE]`

Build an image from a Dockerfile, named for the aoox registry (refuses a version that already exists there)

```
USAGE
  $ aoox registry build [IMAGE] [-t <value>] [-u <value>] [--force] [--registry <value>] [-y] [--context <value>] [-f
    <value>] [--push]

ARGUMENTS
  [IMAGE]  Image name and version, e.g. myapp:1.0.0. Omit it (or the version) to read them from the project in
           the build context: package.json, pyproject.toml, Cargo.toml, composer.json, pubspec.yaml, *.csproj,
           pom.xml, a VERSION file or a git tag

FLAGS
  -f, --dockerfile=<value>  [default: Dockerfile] Path to the Dockerfile
  -t, --token=<value>       [env: AOOX_TOKEN] API token (aoox_…); defaults to the value from `aoox login`
  -u, --url=<value>         [env: AOOX_URL] Dashboard URL (the address you open the dashboard with, e.g.
                            https://dashboard.example.com); defaults to the value from `aoox login`
      --context=<value>     [default: .] Docker build context
      --force               Overwrite a version that already exists in the registry
      --push                Push the image to the registry right after the build
      --registry=<value>    Registry ID; defaults to the self-hosted registry
  -y, --yes                 Do not ask to confirm an image name or version taken from the project

DESCRIPTION
  Build an image from a Dockerfile, named for the aoox registry (refuses a version that already exists there)

EXAMPLES
  $ aoox registry build myapp:1.0.0

  $ aoox registry build --push

  $ aoox registry build myapp --context ./app

  $ aoox registry build --push --yes

  $ aoox registry build myapp:1.0.0 --push

  $ aoox registry build team/api:2.1.0 -f docker/Dockerfile --context .

  $ aoox registry build myapp:1.0.0 --force
```

_See code: [src/commands/registry/build.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.11/src/commands/registry/build.ts)_

## `aoox registry domain`

Set or remove the custom domain for the self-hosted registry

```
USAGE
  $ aoox registry domain [-t <value>] [-u <value>] [--clear] [--set <value>]

FLAGS
  -t, --token=<value>  [env: AOOX_TOKEN] API token (aoox_…); defaults to the value from `aoox login`
  -u, --url=<value>    [env: AOOX_URL] Dashboard URL (the address you open the dashboard with, e.g.
                       https://dashboard.example.com); defaults to the value from `aoox login`
      --clear          Remove the domain, falling back to host:port
      --set=<value>    Domain for the self-hosted registry

DESCRIPTION
  Set or remove the custom domain for the self-hosted registry

EXAMPLES
  $ aoox registry domain --set registry.example.com

  $ aoox registry domain --clear
```

_See code: [src/commands/registry/domain.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.11/src/commands/registry/domain.ts)_

## `aoox registry push [IMAGE]`

Push a local image to the aoox registry (refuses a version that already exists there)

```
USAGE
  $ aoox registry push [IMAGE] [-t <value>] [-u <value>] [--force] [--registry <value>] [-y]

ARGUMENTS
  [IMAGE]  Image name and version (short or full), e.g. myapp:1.0.0. Omit it (or the version) to read them from
           the project in the current directory: package.json, pyproject.toml, Cargo.toml, composer.json,
           pubspec.yaml, *.csproj, pom.xml, a VERSION file or a git tag

FLAGS
  -t, --token=<value>     [env: AOOX_TOKEN] API token (aoox_…); defaults to the value from `aoox login`
  -u, --url=<value>       [env: AOOX_URL] Dashboard URL (the address you open the dashboard with, e.g.
                          https://dashboard.example.com); defaults to the value from `aoox login`
      --force             Overwrite a version that already exists in the registry
      --registry=<value>  Registry ID; defaults to the self-hosted registry
  -y, --yes               Do not ask to confirm an image name or version taken from the project

DESCRIPTION
  Push a local image to the aoox registry (refuses a version that already exists there)

EXAMPLES
  $ aoox registry push myapp:1.0.0

  $ aoox registry push registry.example.com/myapp:1.0.0

  $ aoox registry push

  $ aoox registry push myapp

  $ aoox registry push myapp:1.0.0 --force
```

_See code: [src/commands/registry/push.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.11/src/commands/registry/push.ts)_

## `aoox reinstall`

Repair/refresh an existing aoox installation without losing data: rewrite compose, merge .env.dist (secrets are never regenerated), then pull + recreate

```
USAGE
  $ aoox reinstall [--dir <value>] [--dry-run] [--no-pull] [--terminal-ssh-user <value>] [-y]

FLAGS
  -y, --yes                        Do not ask for confirmation
      --dir=<value>                [default: /opt/aoox] Installation directory
      --dry-run                    Print the plan (changed files, keys to add, compose commands) without changing
                                   anything
      --no-pull                    Skip docker compose pull (use the images already present)
      --terminal-ssh-user=<value>  Set/overwrite TERMINAL_SSH_USER in .env.dist during repair

DESCRIPTION
  Repair/refresh an existing aoox installation without losing data: rewrite compose, merge .env.dist (secrets are never
  regenerated), then pull + recreate

EXAMPLES
  sudo aoox reinstall --dry-run

  sudo aoox reinstall

  sudo aoox reinstall --yes --terminal-ssh-user root
```

_See code: [src/commands/reinstall.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.11/src/commands/reinstall.ts)_

## `aoox run`

Run a command with the variables the linked application gets at deploy time, without writing them to disk: its linked variable set environments in order (a later one wins), then its own env on top. With --set/--env, exactly one set environment instead. Put the command after `--`; its exit code is forwarded. Before the command starts, one line on stderr says how many variables aoox injects and from which layers (colour only on a terminal; NO_COLOR turns it off, FORCE_COLOR forces it); --quiet hides it, but never the warnings. Every read is recorded in the audit log

```
USAGE
  $ aoox run [-t <value>] [-u <value>] [--stack <value> | --app <value>] [-e <value>] [-s <value>]
    [--file <value>] [-q]

FLAGS
  -e, --env=<value>    Environment of the set (e.g. development, staging, production). Default: the only environment of
                       the set the linked application links
  -q, --quiet          Do not print the "Injecting N variables" line or the informational notes. Warnings about
                       unresolved references and excluded Infisical secrets are always printed
  -s, --set=<value>    Variable set slug (or name). Default: the only set the linked application links, or the only set
                       you can see
  -t, --token=<value>  [env: AOOX_TOKEN] API token (aoox_…); defaults to the value from `aoox login`
  -u, --url=<value>    [env: AOOX_URL] Dashboard URL (the address you open the dashboard with, e.g.
                       https://dashboard.example.com); defaults to the value from `aoox login`
      --app=<value>    Application ID; defaults to the application linked with `aoox link`
      --file=<value>   A local .env file layered on top (it wins over aoox, which wins over the current environment).
                       Only read, never written
      --stack=<value>  Compose stack ID, instead of an application

DESCRIPTION
  Run a command with the variables the linked application gets at deploy time, without writing them to disk: its linked
  variable set environments in order (a later one wins), then its own env on top. With --set/--env, exactly one set
  environment instead. Put the command after `--`; its exit code is forwarded. Before the command starts, one line on
  stderr says how many variables aoox injects and from which layers (colour only on a terminal; NO_COLOR turns it off,
  FORCE_COLOR forces it); --quiet hides it, but never the warnings. Every read is recorded in the audit log

EXAMPLES
  $ aoox run -- npm run dev

  $ aoox run --set shared --env staging -- node server.js

  $ aoox run --file .env.local -- npm run dev

  $ aoox run --stack <id> -- docker compose config

  $ aoox run --quiet -- npm run dev
```

_See code: [src/commands/run.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.11/src/commands/run.ts)_

## `aoox update`

Update the aoox CLI itself (use `aoox update panel` to update the panel)

```
USAGE
  $ aoox update [--check]

FLAGS
  --check  Only report whether a newer version exists; change nothing

DESCRIPTION
  Update the aoox CLI itself (use `aoox update panel` to update the panel)

EXAMPLES
  $ aoox update

  $ aoox update --check
```

_See code: [src/commands/update.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.11/src/commands/update.ts)_

## `aoox update panel`

Check for or apply updates to the aoox panel itself (the aoox-api and aoox-web images)

```
USAGE
  $ aoox update panel [-t <value>] [-u <value>] [--apply]

FLAGS
  -t, --token=<value>  [env: AOOX_TOKEN] API token (aoox_…); defaults to the value from `aoox login`
  -u, --url=<value>    [env: AOOX_URL] Dashboard URL (the address you open the dashboard with, e.g.
                       https://dashboard.example.com); defaults to the value from `aoox login`
      --apply          Apply the update if one is available (pull + restart)

DESCRIPTION
  Check for or apply updates to the aoox panel itself (the aoox-api and aoox-web images)

EXAMPLES
  $ aoox update panel

  $ aoox update panel --apply
```

_See code: [src/commands/update/panel.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.11/src/commands/update/panel.ts)_

## `aoox whoami`

Show the account and panel in use

```
USAGE
  $ aoox whoami [--json] [-t <value>] [-u <value>]

FLAGS
  -t, --token=<value>  [env: AOOX_TOKEN] API token (aoox_…); defaults to the value from `aoox login`
  -u, --url=<value>    [env: AOOX_URL] Dashboard URL (the address you open the dashboard with, e.g.
                       https://dashboard.example.com); defaults to the value from `aoox login`

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Show the account and panel in use

EXAMPLES
  $ aoox whoami

  $ aoox whoami --json
```

_See code: [src/commands/whoami.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.11/src/commands/whoami.ts)_
<!-- commandsstop -->
* [`aoox deploy`](#aoox-deploy)
* [`aoox domain clear`](#aoox-domain-clear)
* [`aoox domain set`](#aoox-domain-set)
* [`aoox env list`](#aoox-env-list)
* [`aoox env pull`](#aoox-env-pull)
* [`aoox env set ASSIGNMENTS`](#aoox-env-set-assignments)
* [`aoox env unset KEYS`](#aoox-env-unset-keys)
* [`aoox help [COMMAND]`](#aoox-help-command)
* [`aoox install`](#aoox-install)
* [`aoox link`](#aoox-link)
* [`aoox login`](#aoox-login)
* [`aoox plugins`](#aoox-plugins)
* [`aoox plugins add PLUGIN`](#aoox-plugins-add-plugin)
* [`aoox plugins:inspect PLUGIN...`](#aoox-pluginsinspect-plugin)
* [`aoox plugins install PLUGIN`](#aoox-plugins-install-plugin)
* [`aoox plugins link PATH`](#aoox-plugins-link-path)
* [`aoox plugins remove [PLUGIN]`](#aoox-plugins-remove-plugin)
* [`aoox plugins reset`](#aoox-plugins-reset)
* [`aoox plugins uninstall [PLUGIN]`](#aoox-plugins-uninstall-plugin)
* [`aoox plugins unlink [PLUGIN]`](#aoox-plugins-unlink-plugin)
* [`aoox plugins update`](#aoox-plugins-update)
* [`aoox registry build [IMAGE]`](#aoox-registry-build-image)
* [`aoox registry domain`](#aoox-registry-domain)
* [`aoox registry push [IMAGE]`](#aoox-registry-push-image)
* [`aoox reinstall`](#aoox-reinstall)
* [`aoox run`](#aoox-run)
* [`aoox update`](#aoox-update)
* [`aoox update panel`](#aoox-update-panel)
* [`aoox whoami`](#aoox-whoami)

## `aoox deploy`

Build a local image, push it to the aoox registry, then deploy (the repo must be linked with `aoox link` first)

```
USAGE
  $ aoox deploy [-t <value>] [-u <value>] [--context <value>] [-f <value>] [--registry <value>] [--tag
    <value>]

FLAGS
  -f, --dockerfile=<value>  [default: Dockerfile] Path to the Dockerfile
  -t, --token=<value>       [env: AOOX_TOKEN] API token (aoox_…); defaults to the value from `aoox login`
  -u, --url=<value>         [env: AOOX_URL] Dashboard URL (the address you open the dashboard with, e.g.
                            https://dashboard.example.com); defaults to the value from `aoox login`
      --context=<value>     [default: .] Docker build context
      --registry=<value>    Registry ID to push to; defaults to the self-hosted registry
      --tag=<value>         Image tag; defaults to the git short SHA (+ -dirty)

DESCRIPTION
  Build a local image, push it to the aoox registry, then deploy (the repo must be linked with `aoox link` first)

EXAMPLES
  $ aoox deploy

  $ aoox deploy --tag v1.2.3
```

_See code: [src/commands/deploy.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.8/src/commands/deploy.ts)_

## `aoox domain clear`

Remove the custom domain of the panel itself and go back to IP access (IP:3000) through the running panel API

```
USAGE
  $ aoox domain clear [-t <value>] [-u <value>] [-y]

FLAGS
  -t, --token=<value>  [env: AOOX_TOKEN] API token (aoox_…); defaults to the value from `aoox login`
  -u, --url=<value>    [env: AOOX_URL] Dashboard URL (the address you open the dashboard with, e.g.
                       https://dashboard.example.com); defaults to the value from `aoox login`
  -y, --yes            Do not ask for confirmation

DESCRIPTION
  Remove the custom domain of the panel itself and go back to IP access (IP:3000) through the running panel API

EXAMPLES
  $ aoox domain clear

  $ aoox domain clear --yes
```

_See code: [src/commands/domain/clear.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.11/src/commands/domain/clear.ts)_

## `aoox domain set`

Set a custom domain for the panel itself (not an application) through the running panel API

```
USAGE
  $ aoox domain set --api <value> --web <value> [-t <value>] [-u <value>] [--acme-email <value>] [--domain-only]

FLAGS
  -t, --token=<value>       [env: AOOX_TOKEN] API token (aoox_…); defaults to the value from `aoox login`
  -u, --url=<value>         [env: AOOX_URL] Dashboard URL (the address you open the dashboard with, e.g.
                            https://dashboard.example.com); defaults to the value from `aoox login`
      --acme-email=<value>  Email for the Let's Encrypt certificate
      --api=<value>         (required) Domain for the panel API
      --[no-]domain-only    Only allow access through the domain: ports 3000/3001 listen on 127.0.0.1 only (default:
                            keep the current setting). Use --no-domain-only to open them again. Make sure the domain
                            works first, or you lose IP:port access
      --web=<value>         (required) Domain for the panel dashboard

DESCRIPTION
  Set a custom domain for the panel itself (not an application) through the running panel API

EXAMPLES
  $ aoox domain set --web panel.example.com --api api.example.com

  $ aoox domain set --web panel.example.com --api api.example.com --acme-email you@example.com

  $ aoox domain set --web panel.example.com --api api.example.com --domain-only
```

_See code: [src/commands/domain/set.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.8/src/commands/domain/set.ts)_

## `aoox env list`

List the project environments, or (with --env) the variable names of one. Values are masked unless --reveal is given

```
USAGE
  $ aoox env list [--json] [-t <value>] [-u <value>] [--project <value>] [-e <value>] [--reveal]

FLAGS
  -e, --env=<value>      Environment name; without it the environments of the project are listed
  -t, --token=<value>    [env: AOOX_TOKEN] API token (aoox_…); defaults to the value from `aoox login`
  -u, --url=<value>      [env: AOOX_URL] Dashboard URL (the address you open the dashboard with, e.g.
                         https://dashboard.example.com); defaults to the value from `aoox login`
      --project=<value>  Project ID or name; defaults to the project of the application linked with `aoox link`
      --reveal           Show the values (needs --env; the read is recorded in the audit log)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  List the project environments, or (with --env) the variable names of one. Values are masked unless --reveal is given

EXAMPLES
  $ aoox env list

  $ aoox env list --env staging

  $ aoox env list --env development --reveal
```

_See code: [src/commands/env/list.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.8/src/commands/env/list.ts)_

## `aoox env pull`

Write the variables of an environment to a local file (mode 0600). Refuses to overwrite unless --force. The read is recorded in the audit log

```
USAGE
  $ aoox env pull [-t <value>] [-u <value>] [--project <value>] [-e <value>] [--file <value>] [--force]

FLAGS
  -e, --env=<value>      [default: development] Environment name (development, staging, production, or a custom one)
  -t, --token=<value>    [env: AOOX_TOKEN] API token (aoox_…); defaults to the value from `aoox login`
  -u, --url=<value>      [env: AOOX_URL] Dashboard URL (the address you open the dashboard with, e.g.
                         https://dashboard.example.com); defaults to the value from `aoox login`
      --file=<value>     [default: .env] File to write, relative to the current folder
      --force            Overwrite the file if it exists
      --project=<value>  Project ID or name; defaults to the project of the application linked with `aoox link`

DESCRIPTION
  Write the variables of an environment to a local file (mode 0600). Refuses to overwrite unless --force. The read is
  recorded in the audit log

EXAMPLES
  $ aoox env pull

  $ aoox env pull --env staging --file .env.staging

  $ aoox env pull --force
```

_See code: [src/commands/env/pull.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.8/src/commands/env/pull.ts)_

## `aoox env set ASSIGNMENTS`

Set one or more variables in an environment. Existing comments and order are kept; the write fails if someone else changed the environment in between

```
USAGE
  $ aoox env set ASSIGNMENTS... [-t <value>] [-u <value>] [--project <value>] [-e <value>]

ARGUMENTS
  ASSIGNMENTS...  KEY=VALUE (the value is stored exactly as given)

FLAGS
  -e, --env=<value>      [default: development] Environment name (development, staging, production, or a custom one)
  -t, --token=<value>    [env: AOOX_TOKEN] API token (aoox_…); defaults to the value from `aoox login`
  -u, --url=<value>      [env: AOOX_URL] Dashboard URL (the address you open the dashboard with, e.g.
                         https://dashboard.example.com); defaults to the value from `aoox login`
      --project=<value>  Project ID or name; defaults to the project of the application linked with `aoox link`

DESCRIPTION
  Set one or more variables in an environment. Existing comments and order are kept; the write fails if someone else
  changed the environment in between

EXAMPLES
  $ aoox env set API_URL=https://api.example.com

  $ aoox env set GREETING="hello world" QUERY=a=b --env staging
```

_See code: [src/commands/env/set.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.8/src/commands/env/set.ts)_

## `aoox env unset KEYS`

Remove one or more variables from an environment. Comments and the other variables are kept; the write fails if someone else changed the environment in between

```
USAGE
  $ aoox env unset KEYS... [-t <value>] [-u <value>] [--project <value>] [-e <value>]

ARGUMENTS
  KEYS...  Variable name(s) to remove

FLAGS
  -e, --env=<value>      [default: development] Environment name (development, staging, production, or a custom one)
  -t, --token=<value>    [env: AOOX_TOKEN] API token (aoox_…); defaults to the value from `aoox login`
  -u, --url=<value>      [env: AOOX_URL] Dashboard URL (the address you open the dashboard with, e.g.
                         https://dashboard.example.com); defaults to the value from `aoox login`
      --project=<value>  Project ID or name; defaults to the project of the application linked with `aoox link`

DESCRIPTION
  Remove one or more variables from an environment. Comments and the other variables are kept; the write fails if
  someone else changed the environment in between

EXAMPLES
  $ aoox env unset OLD_KEY

  $ aoox env unset A B --env staging
```

_See code: [src/commands/env/unset.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.8/src/commands/env/unset.ts)_

## `aoox help [COMMAND]`

Display help for aoox.

```
USAGE
  $ aoox help [COMMAND...] [-n]

ARGUMENTS
  [COMMAND...]  Command to show help for.

FLAGS
  -n, --nested-commands  Include all nested commands in the output.

DESCRIPTION
  Display help for aoox.
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/6.3.0/src/commands/help.ts)_

## `aoox install`

Install aoox (postgres + api + web) on a fresh VPS with Docker Compose

```
USAGE
  $ aoox install [--acme-email <value>] [--admin-name <value> --admin-email <value>] [--admin-password
    <value> ] [--api-domain <value> --web-domain <value>] [--dir <value>] [--force] [--no-terminal-authorize]
    [--terminal-ssh-user <value>] [-y]

FLAGS
  -y, --yes                        Do not ask for any confirmation
      --acme-email=<value>         Required with --web-domain/--api-domain (Let’s Encrypt)
      --admin-email=<value>        Create the first owner without going through /setup in the browser
      --admin-name=<value>         Name of the first owner
      --admin-password=<value>     Password of the first owner (min. 8 characters)
      --api-domain=<value>         Domain for the API, served through the bundled proxy
      --dir=<value>                [default: /opt/aoox] Installation directory
      --force                      Overwrite an existing installation in --dir
      --no-terminal-authorize      Do not create/authorize the web Terminal SSH key automatically (do it in Settings >
                                   Terminal instead)
      --terminal-ssh-user=<value>  SSH user the web Terminal uses to log in to this host (default: the user running
                                   sudo, or root if there is none)
      --web-domain=<value>         Domain for the web panel, served through the bundled proxy

DESCRIPTION
  Install aoox (postgres + api + web) on a fresh VPS with Docker Compose

EXAMPLES
  sudo aoox install

  sudo aoox install --web-domain panel.example.com --api-domain api.panel.example.com --acme-email me@example.com
```

_See code: [src/commands/install.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.8/src/commands/install.ts)_

## `aoox link`

Link this folder to an application in the panel (used by `aoox deploy`/`aoox logs`)

```
USAGE
  $ aoox link [-t <value>] [-u <value>] [--app <value>] [--project <value>]

FLAGS
  -t, --token=<value>    [env: AOOX_TOKEN] API token (aoox_…); defaults to the value from `aoox login`
  -u, --url=<value>      [env: AOOX_URL] Dashboard URL (the address you open the dashboard with, e.g.
                         https://dashboard.example.com); defaults to the value from `aoox login`
      --app=<value>      Application ID; skip the interactive selection
      --project=<value>  Project ID; skip the interactive selection

DESCRIPTION
  Link this folder to an application in the panel (used by `aoox deploy`/`aoox logs`)

EXAMPLES
  $ aoox link

  $ aoox link --project <id> --app <id>
```

_See code: [src/commands/link.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.8/src/commands/link.ts)_

## `aoox login`

Save the dashboard address and API token for other commands (the API address is discovered automatically)

```
USAGE
  $ aoox login [-t <value>] [-u <value>]

FLAGS
  -t, --token=<value>  [env: AOOX_TOKEN] API token (aoox_…); defaults to the value from `aoox login`
  -u, --url=<value>    [env: AOOX_URL] Dashboard URL (the address you open the dashboard with, e.g.
                       https://dashboard.example.com); defaults to the value from `aoox login`

DESCRIPTION
  Save the dashboard address and API token for other commands (the API address is discovered automatically)

EXAMPLES
  $ aoox login

  $ aoox login --url https://dashboard.example.com --token aoox_xxx

  $ aoox login --url 203.0.113.10:3000 --token aoox_xxx
```

_See code: [src/commands/login.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.8/src/commands/login.ts)_

## `aoox plugins`

List installed plugins.

```
USAGE
  $ aoox plugins [--json] [--core]

FLAGS
  --core  Show core plugins.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  List installed plugins.

EXAMPLES
  $ aoox plugins
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/5.5.2/src/commands/plugins/index.ts)_

## `aoox plugins add PLUGIN`

Installs a plugin into aoox.

```
USAGE
  $ aoox plugins add PLUGIN... [--json] [-f] [-h] [-s | -v]

ARGUMENTS
  PLUGIN...  Plugin to install.

FLAGS
  -f, --force    Force npm to fetch remote resources even if a local copy exists on disk.
  -h, --help     Show CLI help.
  -s, --silent   Silences npm output.
  -v, --verbose  Show verbose npm output.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Installs a plugin into aoox.

  Uses npm to install plugins.

  Installation of a user-installed plugin will override a core plugin.

  Use the AOOX_NPM_LOG_LEVEL environment variable to set the npm loglevel.
  Use the AOOX_NPM_REGISTRY environment variable to set the npm registry.

ALIASES
  $ aoox plugins add

EXAMPLES
  Install a plugin from npm registry.

    $ aoox plugins add myplugin

  Install a plugin from a github url.

    $ aoox plugins add https://github.com/someuser/someplugin

  Install a plugin from a github slug.

    $ aoox plugins add someuser/someplugin
```

## `aoox plugins:inspect PLUGIN...`

Displays installation properties of a plugin.

```
USAGE
  $ aoox plugins inspect PLUGIN...

ARGUMENTS
  PLUGIN...  [default: .] Plugin to inspect.

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Displays installation properties of a plugin.

EXAMPLES
  $ aoox plugins inspect myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/5.5.2/src/commands/plugins/inspect.ts)_

## `aoox plugins install PLUGIN`

Installs a plugin into aoox.

```
USAGE
  $ aoox plugins install PLUGIN... [--json] [-f] [-h] [-s | -v]

ARGUMENTS
  PLUGIN...  Plugin to install.

FLAGS
  -f, --force    Force npm to fetch remote resources even if a local copy exists on disk.
  -h, --help     Show CLI help.
  -s, --silent   Silences npm output.
  -v, --verbose  Show verbose npm output.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Installs a plugin into aoox.

  Uses npm to install plugins.

  Installation of a user-installed plugin will override a core plugin.

  Use the AOOX_NPM_LOG_LEVEL environment variable to set the npm loglevel.
  Use the AOOX_NPM_REGISTRY environment variable to set the npm registry.

ALIASES
  $ aoox plugins add

EXAMPLES
  Install a plugin from npm registry.

    $ aoox plugins install myplugin

  Install a plugin from a github url.

    $ aoox plugins install https://github.com/someuser/someplugin

  Install a plugin from a github slug.

    $ aoox plugins install someuser/someplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/5.5.2/src/commands/plugins/install.ts)_

## `aoox plugins link PATH`

Links a plugin into the CLI for development.

```
USAGE
  $ aoox plugins link PATH [-h] [--install] [-v]

ARGUMENTS
  PATH  [default: .] path to plugin

FLAGS
  -h, --help          Show CLI help.
  -v, --verbose
      --[no-]install  Install dependencies after linking the plugin.

DESCRIPTION
  Links a plugin into the CLI for development.

  Installation of a linked plugin will override a user-installed or core plugin.

  e.g. If you have a user-installed or core plugin that has a 'hello' command, installing a linked plugin with a 'hello'
  command will override the user-installed or core plugin implementation. This is useful for development work.


EXAMPLES
  $ aoox plugins link myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/5.5.2/src/commands/plugins/link.ts)_

## `aoox plugins remove [PLUGIN]`

Removes a plugin from the CLI.

```
USAGE
  $ aoox plugins remove [PLUGIN...] [-h] [-v]

ARGUMENTS
  [PLUGIN...]  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ aoox plugins unlink
  $ aoox plugins remove

EXAMPLES
  $ aoox plugins remove myplugin
```

## `aoox plugins reset`

Remove all user-installed and linked plugins.

```
USAGE
  $ aoox plugins reset [--hard] [--reinstall]

FLAGS
  --hard       Delete node_modules and package manager related files in addition to uninstalling plugins.
  --reinstall  Reinstall all plugins after uninstalling.
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/5.5.2/src/commands/plugins/reset.ts)_

## `aoox plugins uninstall [PLUGIN]`

Removes a plugin from the CLI.

```
USAGE
  $ aoox plugins uninstall [PLUGIN...] [-h] [-v]

ARGUMENTS
  [PLUGIN...]  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ aoox plugins unlink
  $ aoox plugins remove

EXAMPLES
  $ aoox plugins uninstall myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/5.5.2/src/commands/plugins/uninstall.ts)_

## `aoox plugins unlink [PLUGIN]`

Removes a plugin from the CLI.

```
USAGE
  $ aoox plugins unlink [PLUGIN...] [-h] [-v]

ARGUMENTS
  [PLUGIN...]  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ aoox plugins unlink
  $ aoox plugins remove

EXAMPLES
  $ aoox plugins unlink myplugin
```

## `aoox plugins update`

Update installed plugins.

```
USAGE
  $ aoox plugins update [-h] [-v]

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Update installed plugins.
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/5.5.2/src/commands/plugins/update.ts)_

## `aoox registry build [IMAGE]`

Build an image from a Dockerfile, named for the aoox registry (refuses a version that already exists there)

```
USAGE
  $ aoox registry build [IMAGE] [-t <value>] [-u <value>] [--force] [--registry <value>] [-y] [--context <value>] [-f
    <value>] [--push]

ARGUMENTS
  [IMAGE]  Image name and version, e.g. myapp:1.0.0. Omit it (or the version) to read them from the project in
           the build context: package.json, pyproject.toml, Cargo.toml, composer.json, pubspec.yaml, *.csproj,
           pom.xml, a VERSION file or a git tag

FLAGS
  -f, --dockerfile=<value>  [default: Dockerfile] Path to the Dockerfile
  -t, --token=<value>       [env: AOOX_TOKEN] API token (aoox_…); defaults to the value from `aoox login`
  -u, --url=<value>         [env: AOOX_URL] Dashboard URL (the address you open the dashboard with, e.g.
                            https://dashboard.example.com); defaults to the value from `aoox login`
      --context=<value>     [default: .] Docker build context
      --force               Overwrite a version that already exists in the registry
      --push                Push the image to the registry right after the build
      --registry=<value>    Registry ID; defaults to the self-hosted registry
  -y, --yes                 Do not ask to confirm an image name or version taken from the project

DESCRIPTION
  Build an image from a Dockerfile, named for the aoox registry (refuses a version that already exists there)

EXAMPLES
  $ aoox registry build myapp:1.0.0

  $ aoox registry build --push

  $ aoox registry build myapp --context ./app

  $ aoox registry build --push --yes

  $ aoox registry build myapp:1.0.0 --push

  $ aoox registry build team/api:2.1.0 -f docker/Dockerfile --context .

  $ aoox registry build myapp:1.0.0 --force
```

_See code: [src/commands/registry/build.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.8/src/commands/registry/build.ts)_

## `aoox registry domain`

Set or remove the custom domain for the self-hosted registry

```
USAGE
  $ aoox registry domain [-t <value>] [-u <value>] [--clear] [--set <value>]

FLAGS
  -t, --token=<value>  [env: AOOX_TOKEN] API token (aoox_…); defaults to the value from `aoox login`
  -u, --url=<value>    [env: AOOX_URL] Dashboard URL (the address you open the dashboard with, e.g.
                       https://dashboard.example.com); defaults to the value from `aoox login`
      --clear          Remove the domain, falling back to host:port
      --set=<value>    Domain for the self-hosted registry

DESCRIPTION
  Set or remove the custom domain for the self-hosted registry

EXAMPLES
  $ aoox registry domain --set registry.example.com

  $ aoox registry domain --clear
```

_See code: [src/commands/registry/domain.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.8/src/commands/registry/domain.ts)_

## `aoox registry push [IMAGE]`

Push a local image to the aoox registry (refuses a version that already exists there)

```
USAGE
  $ aoox registry push [IMAGE] [-t <value>] [-u <value>] [--force] [--registry <value>] [-y]

ARGUMENTS
  [IMAGE]  Image name and version (short or full), e.g. myapp:1.0.0. Omit it (or the version) to read them from
           the project in the current directory: package.json, pyproject.toml, Cargo.toml, composer.json,
           pubspec.yaml, *.csproj, pom.xml, a VERSION file or a git tag

FLAGS
  -t, --token=<value>     [env: AOOX_TOKEN] API token (aoox_…); defaults to the value from `aoox login`
  -u, --url=<value>       [env: AOOX_URL] Dashboard URL (the address you open the dashboard with, e.g.
                          https://dashboard.example.com); defaults to the value from `aoox login`
      --force             Overwrite a version that already exists in the registry
      --registry=<value>  Registry ID; defaults to the self-hosted registry
  -y, --yes               Do not ask to confirm an image name or version taken from the project

DESCRIPTION
  Push a local image to the aoox registry (refuses a version that already exists there)

EXAMPLES
  $ aoox registry push myapp:1.0.0

  $ aoox registry push registry.example.com/myapp:1.0.0

  $ aoox registry push

  $ aoox registry push myapp

  $ aoox registry push myapp:1.0.0 --force
```

_See code: [src/commands/registry/push.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.8/src/commands/registry/push.ts)_

## `aoox reinstall`

Repair/refresh an existing aoox installation without losing data: rewrite compose, merge .env.dist (secrets are never regenerated), then pull + recreate

```
USAGE
  $ aoox reinstall [--dir <value>] [--dry-run] [--no-pull] [--terminal-ssh-user <value>] [-y]

FLAGS
  -y, --yes                        Do not ask for confirmation
      --dir=<value>                [default: /opt/aoox] Installation directory
      --dry-run                    Print the plan (changed files, keys to add, compose commands) without changing
                                   anything
      --no-pull                    Skip docker compose pull (use the images already present)
      --terminal-ssh-user=<value>  Set/overwrite TERMINAL_SSH_USER in .env.dist during repair

DESCRIPTION
  Repair/refresh an existing aoox installation without losing data: rewrite compose, merge .env.dist (secrets are never
  regenerated), then pull + recreate

EXAMPLES
  sudo aoox reinstall --dry-run

  sudo aoox reinstall

  sudo aoox reinstall --yes --terminal-ssh-user root
```

_See code: [src/commands/reinstall.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.8/src/commands/reinstall.ts)_

## `aoox run`

Run a command with the variables of an environment, without writing them to disk. Put the command after `--`; its exit code is forwarded. The read is recorded in the audit log

```
USAGE
  $ aoox run [-t <value>] [-u <value>] [--project <value>] [-e <value>]

FLAGS
  -e, --env=<value>      [default: development] Environment name (development, staging, production, or a custom one)
  -t, --token=<value>    [env: AOOX_TOKEN] API token (aoox_…); defaults to the value from `aoox login`
  -u, --url=<value>      [env: AOOX_URL] Dashboard URL (the address you open the dashboard with, e.g.
                         https://dashboard.example.com); defaults to the value from `aoox login`
      --project=<value>  Project ID or name; defaults to the project of the application linked with `aoox link`

DESCRIPTION
  Run a command with the variables of an environment, without writing them to disk. Put the command after `--`; its exit
  code is forwarded. The read is recorded in the audit log

EXAMPLES
  $ aoox run -- npm run dev

  $ aoox run --env staging -- node server.js
```

_See code: [src/commands/run.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.8/src/commands/run.ts)_

## `aoox update`

Update the aoox CLI itself (use `aoox update panel` to update the panel)

```
USAGE
  $ aoox update [--check]

FLAGS
  --check  Only report whether a newer version exists; change nothing

DESCRIPTION
  Update the aoox CLI itself (use `aoox update panel` to update the panel)

EXAMPLES
  $ aoox update

  $ aoox update --check
```

_See code: [src/commands/update.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.8/src/commands/update.ts)_

## `aoox update panel`

Check for or apply updates to the aoox panel itself (the aoox-api and aoox-web images)

```
USAGE
  $ aoox update panel [-t <value>] [-u <value>] [--apply]

FLAGS
  -t, --token=<value>  [env: AOOX_TOKEN] API token (aoox_…); defaults to the value from `aoox login`
  -u, --url=<value>    [env: AOOX_URL] Dashboard URL (the address you open the dashboard with, e.g.
                       https://dashboard.example.com); defaults to the value from `aoox login`
      --apply          Apply the update if one is available (pull + restart)

DESCRIPTION
  Check for or apply updates to the aoox panel itself (the aoox-api and aoox-web images)

EXAMPLES
  $ aoox update panel

  $ aoox update panel --apply
```

_See code: [src/commands/update/panel.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.8/src/commands/update/panel.ts)_

## `aoox whoami`

Show the account and panel in use

```
USAGE
  $ aoox whoami [--json] [-t <value>] [-u <value>]

FLAGS
  -t, --token=<value>  [env: AOOX_TOKEN] API token (aoox_…); defaults to the value from `aoox login`
  -u, --url=<value>    [env: AOOX_URL] Dashboard URL (the address you open the dashboard with, e.g.
                       https://dashboard.example.com); defaults to the value from `aoox login`

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Show the account and panel in use

EXAMPLES
  $ aoox whoami

  $ aoox whoami --json
```

_See code: [src/commands/whoami.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.8/src/commands/whoami.ts)_
<!-- commandsstop -->

## Versioning

Versioned independently from `aoox-api`, `aoox-web`, and `aoox-landing` — see [CHANGELOG.md](CHANGELOG.md).
