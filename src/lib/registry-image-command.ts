import {select} from '@inquirer/prompts'
import {Command, Flags} from '@oclif/core'

import type {Registry, RegistryCredentials} from './types.js'

import {api} from './api.js'
import {MissingCredentialsError} from './config.js'
import {dockerEngineStatus, dockerInherit, dockerLogin, dockerUnavailableLines} from './docker.js'
import {connectionFlags, loadCredentials} from './flags.js'
import {ImageNameError, parseImageName, registryHost, suggestNextVersion} from './image-ref.js'
import {warnIfOutdated} from './outdated.js'
import {manifestExistsAnywhere, registryBaseUrls, RegistryCheckError} from './registry-check.js'
import {chooseRegistry, localhostRegistryHint} from './registry-select.js'
import {errorLine} from './style.js'

/** Longest image reference the API accepts for `imageRef`. */
const MAX_REF_LENGTH = 300

export interface ResolvedImage {
  baseUrls: string[]
  credentials: RegistryCredentials
  /** `<host>/<repo>:<tag>` — the local and remote name. */
  fullRef: string
  host: string
  registry: Registry
  /** Repository path inside the registry (image prefix included). */
  repo: string
  /** What the user typed, without host: `name:version`. */
  shortRef: string
  tag: string
}

export const registryImageFlags = {
  ...connectionFlags,
  force: Flags.boolean({description: 'Overwrite a version that already exists in the registry'}),
  registry: Flags.string({description: 'Registry ID; defaults to the self-hosted registry'}),
}

/** Shared by `aoox registry build` and `aoox registry push`. */
export abstract class RegistryImageCommand extends Command {
  /** Prints an `error` label plus the first line plus plain hint lines to stderr and exits 1. */
  protected fail(...lines: string[]): never {
    for (const [i, line] of lines.entries()) {
      this.logToStderr(i === 0 ? errorLine(line) : line)
    }

    this.exit(1)
  }

  /** `docker login` (when the registry has credentials) then `docker push`; shared by `push` and `build --push`. */
  protected async pushImage(image: ResolvedImage): Promise<void> {
    const {password, username} = image.credentials
    if (username && password) {
      this.log(`==> docker login ${image.host}`)
      await dockerLogin(image.host, username, password, process.cwd())
    }

    this.log(`==> Push ${image.fullRef}`)
    await dockerInherit(['push', image.fullRef], process.cwd())

    this.log(`Pushed ${image.fullRef}`)
    this.log('Use it in the dashboard: New application → Ready-made image')
  }

  /** The registry layer: exists -> fail unless `--force` (or the `latest` tag). */
  protected async refuseExisting(image: ResolvedImage, options: {force: boolean; verb: string}): Promise<void> {
    if (options.force || image.tag === 'latest') return

    let exists: boolean
    try {
      exists = await manifestExistsAnywhere(image.baseUrls, {
        password: image.credentials.password,
        repo: image.repo,
        tag: image.tag,
        username: image.credentials.username,
      })
    } catch (error) {
      if (error instanceof RegistryCheckError) {
        this.fail(`Could not check ${image.shortRef} in ${image.host}: ${error.message}.`, 'Add --force to skip this check.')
      }

      throw error
    }

    if (!exists) return
    const bumped = suggestNextVersion(image.tag)
    const name = image.shortRef.slice(0, image.shortRef.lastIndexOf(':'))
    this.fail(
      `${image.shortRef} already exists in ${image.host}.`,
      bumped
        ? `Pick a new version (e.g. ${name}:${bumped}), or add --force to ${options.verb} it.`
        : `Pick a new version, or add --force to ${options.verb} it.`,
    )
  }

  /** Stops early with a plain message when the local Docker engine is missing or not running. */
  protected async requireDocker(): Promise<void> {
    const status = await dockerEngineStatus()
    if (status !== 'ok') this.fail(...dockerUnavailableLines(status))
  }

  protected async resolveImage(
    raw: string,
    flags: {registry?: string; token?: string; url?: string},
    example: string,
  ): Promise<ResolvedImage> {
    let parsed
    try {
      parsed = parseImageName(raw)
    } catch (error) {
      if (error instanceof ImageNameError) this.fail(error.message)
      throw error
    }

    if (!parsed.tag) {
      this.fail(`A version is required: "${raw}" has none.`, `Example: ${example} (name:version, e.g. ${parsed.repo}:1.0.0)`)
    }

    let config
    try {
      config = await loadCredentials(this.config.configDir, flags)
    } catch (error) {
      if (error instanceof MissingCredentialsError) {
        this.error(error.message, {suggestions: ['Run `aoox login`.']})
      }

      throw error
    }

    await warnIfOutdated((m) => this.warn(m), this.config.version, config)

    const registries = await api<Registry[]>(config, '/registries')
    const choice = chooseRegistry(registries, flags.registry, parsed.host)
    let registry: Registry
    switch (choice.kind) {
      case 'ambiguous': {
        if (!process.stdin.isTTY) {
          this.error('There are several registries and none is self-hosted; cannot pick one automatically.', {
            suggestions: ['Pass --registry <id>.'],
          })
        }

        registry = await select({
          choices: choice.registries.map((r) => ({name: `${r.name} (${r.url})`, value: r})),
          message: 'Select a registry',
        })
        break
      }

      case 'error': {
        this.error(choice.message, {suggestions: choice.suggestions})
        break
      }

      case 'found': {
        registry = choice.registry
        break
      }
    }

    const host = registryHost(registry.url)
    if (parsed.host && parsed.host !== host) {
      this.fail(
        `${raw} points to ${parsed.host}, but the selected registry is ${host}.`,
        'Use the short name (name:version), or pass --registry <id> for that registry.',
      )
    }

    const credentials = await api<RegistryCredentials>(config, `/registries/${registry.id}/credentials`)

    const prefix = registry.imagePrefix?.replaceAll(/^\/+|\/+$/g, '')
    // A full name already carries the prefix; a short one gets it added.
    const repo = parsed.host || !prefix ? parsed.repo : `${prefix}/${parsed.repo}`
    const fullRef = `${host}/${repo}:${parsed.tag}`
    if (fullRef.length > MAX_REF_LENGTH) this.fail(`The image reference is too long (${fullRef.length} > ${MAX_REF_LENGTH} characters).`)

    const hint = localhostRegistryHint(registry.url, config.url)
    if (hint) this.warn(hint)

    return {
      baseUrls: registryBaseUrls(registry),
      credentials,
      fullRef,
      host,
      registry,
      repo,
      shortRef: `${parsed.repo}:${parsed.tag}`,
      tag: parsed.tag,
    }
  }
}
