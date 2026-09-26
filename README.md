aoox
=================

CLI for [aoox](https://github.com/hideandseeklab/aoox-api), a self-hosted PaaS — build and deploy


[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/%40hideandseeklab%2Faoox.svg)](https://npmjs.org/package/@hideandseeklab/aoox)
[![Downloads/week](https://img.shields.io/npm/dw/%40hideandseeklab%2Faoox.svg)](https://npmjs.org/package/@hideandseeklab/aoox)


<!-- toc -->
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
@hideandseeklab/aoox/0.1.0-alpha.0 win32-x64 node-v24.12.0
$ aoox --help [COMMAND]
USAGE
  $ aoox COMMAND
...
```
<!-- usagestop -->

# Installation

`aoox` is still in **alpha** — published to npm under the `alpha` dist-tag, not `latest`
(the package has never had a stable release, so `npm install -g @hideandseeklab/aoox` without a
tag will fail to find a version). Install explicitly with this tag:

```sh-session
npm install -g @hideandseeklab/aoox@alpha
```

`aoox` is then available globally. This also applies to `aoox install` on a new VPS —
Node ≥22 must already be installed on that VPS **before** the step above (`aoox install`
itself needs Node to run, so it cannot install Node for you first).

To install from source (e.g. to contribute, or to get the latest `main` before it is
released to npm):

```sh-session
git clone https://github.com/hideandseeklab/aoox-cli.git
cd aoox-cli
npm install
npm run build
npm link            # or: npm install -g .
```

# Commands
<!-- commands -->
* [`aoox deploy`](#aoox-deploy)
* [`aoox domain set`](#aoox-domain-set)
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
* [`aoox registry domain`](#aoox-registry-domain)
* [`aoox whoami`](#aoox-whoami)

## `aoox deploy`

Build image lokal, push ke registry aoox, lalu deploy (repo harus di-`aoox link` dulu)

```
USAGE
  $ aoox deploy [-t <value>] [-u <value>] [--context <value>] [-f <value>] [--registry <value>] [--tag
    <value>]

FLAGS
  -f, --dockerfile=<value>  [default: Dockerfile] Path ke Dockerfile
  -t, --token=<value>       [env: AOOX_TOKEN] API token (aoox_…); default dari hasil `aoox login`
  -u, --url=<value>         [env: AOOX_URL] URL panel aoox; default dari hasil `aoox login`
      --context=<value>     [default: .] Docker build context
      --registry=<value>    ID registry tujuan push; default registry self-hosted
      --tag=<value>         Tag image; default git short SHA (+ -dirty)

DESCRIPTION
  Build image lokal, push ke registry aoox, lalu deploy (repo harus di-`aoox link` dulu)

EXAMPLES
  $ aoox deploy

  $ aoox deploy --tag v1.2.3
```

_See code: [src/commands/deploy.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.0/src/commands/deploy.ts)_

## `aoox domain set`

Set domain kustom untuk panel itu sendiri (bukan aplikasi) lewat API panel yang sudah jalan

```
USAGE
  $ aoox domain set --api <value> --web <value> [-t <value>] [-u <value>] [--acme-email <value>]

FLAGS
  -t, --token=<value>       [env: AOOX_TOKEN] API token (aoox_…); default dari hasil `aoox login`
  -u, --url=<value>         [env: AOOX_URL] URL panel aoox; default dari hasil `aoox login`
      --acme-email=<value>  Email untuk sertifikat Let's Encrypt
      --api=<value>         (required) Domain untuk API panel
      --web=<value>         (required) Domain untuk dashboard panel

DESCRIPTION
  Set domain kustom untuk panel itu sendiri (bukan aplikasi) lewat API panel yang sudah jalan

EXAMPLES
  $ aoox domain set --web panel.example.com --api api.example.com

  $ aoox domain set --web panel.example.com --api api.example.com --acme-email you@example.com
```

_See code: [src/commands/domain/set.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.0/src/commands/domain/set.ts)_

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

Pasang aoox (postgres + api + web) di VPS baru lewat Docker Compose

```
USAGE
  $ aoox install [--acme-email <value>] [--admin-name <value> --admin-email <value>] [--admin-password
    <value> ] [--api-domain <value> --web-domain <value>] [--dir <value>] [--force] [-y]

FLAGS
  -y, --yes                     Jangan tanya konfirmasi apa pun
      --acme-email=<value>      Wajib bersama --web-domain/--api-domain (Let’s Encrypt)
      --admin-email=<value>     Buat owner pertama tanpa lewat /setup di browser
      --admin-name=<value>      Nama owner pertama
      --admin-password=<value>  Password owner pertama (min. 8 karakter)
      --api-domain=<value>      Domain untuk API, lewat proxy bawaan
      --dir=<value>             [default: /opt/aoox] Folder instalasi
      --force                   Timpa instalasi yang sudah ada di --dir
      --web-domain=<value>      Domain untuk panel web, lewat proxy bawaan

DESCRIPTION
  Pasang aoox (postgres + api + web) di VPS baru lewat Docker Compose

EXAMPLES
  sudo aoox install

  sudo aoox install --web-domain panel.example.com --api-domain api.panel.example.com --acme-email me@example.com
```

_See code: [src/commands/install.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.0/src/commands/install.ts)_

## `aoox link`

Hubungkan folder ini ke sebuah aplikasi di panel (dipakai `aoox deploy`/`aoox logs`)

```
USAGE
  $ aoox link [-t <value>] [-u <value>] [--app <value>] [--project <value>]

FLAGS
  -t, --token=<value>    [env: AOOX_TOKEN] API token (aoox_…); default dari hasil `aoox login`
  -u, --url=<value>      [env: AOOX_URL] URL panel aoox; default dari hasil `aoox login`
      --app=<value>      ID aplikasi; lewati pemilihan interaktif
      --project=<value>  ID project; lewati pemilihan interaktif

DESCRIPTION
  Hubungkan folder ini ke sebuah aplikasi di panel (dipakai `aoox deploy`/`aoox logs`)

EXAMPLES
  $ aoox link

  $ aoox link --project <id> --app <id>
```

_See code: [src/commands/link.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.0/src/commands/link.ts)_

## `aoox login`

Simpan URL panel dan API token untuk perintah lain

```
USAGE
  $ aoox login [-t <value>] [-u <value>]

FLAGS
  -t, --token=<value>  [env: AOOX_TOKEN] API token (aoox_…); default dari hasil `aoox login`
  -u, --url=<value>    [env: AOOX_URL] URL panel aoox; default dari hasil `aoox login`

DESCRIPTION
  Simpan URL panel dan API token untuk perintah lain

EXAMPLES
  $ aoox login

  $ aoox login --url https://panel.example.com --token aoox_xxx
```

_See code: [src/commands/login.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.0/src/commands/login.ts)_

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

## `aoox registry domain`

Set atau hapus domain kustom untuk registry self-hosted

```
USAGE
  $ aoox registry domain [-t <value>] [-u <value>] [--clear] [--set <value>]

FLAGS
  -t, --token=<value>  [env: AOOX_TOKEN] API token (aoox_…); default dari hasil `aoox login`
  -u, --url=<value>    [env: AOOX_URL] URL panel aoox; default dari hasil `aoox login`
      --clear          Hapus domain, kembali ke host:port
      --set=<value>    Domain untuk registry self-hosted

DESCRIPTION
  Set atau hapus domain kustom untuk registry self-hosted

EXAMPLES
  $ aoox registry domain --set registry.example.com

  $ aoox registry domain --clear
```

_See code: [src/commands/registry/domain.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.0/src/commands/registry/domain.ts)_

## `aoox whoami`

Tampilkan akun dan panel yang sedang dipakai

```
USAGE
  $ aoox whoami [--json] [-t <value>] [-u <value>]

FLAGS
  -t, --token=<value>  [env: AOOX_TOKEN] API token (aoox_…); default dari hasil `aoox login`
  -u, --url=<value>    [env: AOOX_URL] URL panel aoox; default dari hasil `aoox login`

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Tampilkan akun dan panel yang sedang dipakai

EXAMPLES
  $ aoox whoami

  $ aoox whoami --json
```

_See code: [src/commands/whoami.ts](https://github.com/hideandseeklab/aoox-cli/blob/v0.1.0-alpha.0/src/commands/whoami.ts)_
<!-- commandsstop -->

## Versioning

Versioned independently from `aoox-api`, `aoox-web`, and `aoox-landing` — see [CHANGELOG.md](CHANGELOG.md).
