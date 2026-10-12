import {Command, Flags} from '@oclif/core'

import type {Registry} from '../../lib/types.js'

import {api, ApiError} from '../../lib/api.js'
import {MissingCredentialsError} from '../../lib/config.js'
import {connectionFlags, loadCredentials} from '../../lib/flags.js'
import {warnIfOutdated} from '../../lib/outdated.js'

/**
 * Puts the self-hosted registry behind the built-in proxy on its own domain
 * (`PATCH /registries/:id/domain`) — the CLI equivalent of Settings ->
 * Registry -> Domain. Looks the registry up by type rather than asking for
 * an id, since there is exactly one self-hosted registry per install.
 */
export default class RegistryDomain extends Command {
  static description = 'Set or remove the custom domain for the self-hosted registry'
  static examples = [
    '<%= config.bin %> <%= command.id %> --set registry.example.com',
    '<%= config.bin %> <%= command.id %> --clear',
  ]
static flags = {
    ...connectionFlags,
    clear: Flags.boolean({description: 'Remove the domain, falling back to host:port'}),
    set: Flags.string({description: 'Domain for the self-hosted registry'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(RegistryDomain)

    if (Boolean(flags.set) === flags.clear) {
      this.error('Pass one of: --set <domain> or --clear.')
    }

    let config: Awaited<ReturnType<typeof loadCredentials>>
    try {
      config = await loadCredentials(this.config.configDir, flags)
    } catch (error) {
      if (error instanceof MissingCredentialsError) {
        this.error(error.message, {suggestions: ['Run `aoox login` against this panel first.']})
      }

      throw error
    }

    await warnIfOutdated((m) => this.warn(m), this.config.version, config)

    const registries = await api<Registry[]>(config, '/registries')
    const registry = registries.find((r) => r.type === 'self-hosted')
    if (!registry) {
      this.error('There is no self-hosted registry in this panel yet.', {
        suggestions: ['Provision one first from Settings -> Registry.'],
      })
    }

    try {
      const updated = await api<Registry>(config, `/registries/${registry.id}/domain`, {
        body: {domain: flags.clear ? null : flags.set},
        method: 'PATCH',
      })
      this.log(flags.clear ? `Domain removed. Registry is back at ${updated.url}.` : `Domain applied: ${updated.url}`)
    } catch (error) {
      if (error instanceof ApiError && error.status === 400) {
        this.error(error.message, {
          suggestions: ['Make sure the proxy is provisioned and PROXY_ACME_EMAIL is set.'],
        })
      }

      throw error
    }
  }
}
