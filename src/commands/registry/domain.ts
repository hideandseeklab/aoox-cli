import {Command, Flags} from '@oclif/core'

import type {Registry} from '../../lib/types.js'

import {api, ApiError} from '../../lib/api.js'
import {MissingCredentialsError} from '../../lib/config.js'
import {connectionFlags, loadCredentials} from '../../lib/flags.js'

/**
 * Puts the self-hosted registry behind the built-in proxy on its own domain
 * (`PATCH /registries/:id/domain`) — the CLI equivalent of Settings ->
 * Registry -> Domain. Looks the registry up by type rather than asking for
 * an id, since there is exactly one self-hosted registry per install.
 */
export default class RegistryDomain extends Command {
  static description = 'Set atau hapus domain kustom untuk registry self-hosted'
  static examples = [
    '<%= config.bin %> <%= command.id %> --set registry.example.com',
    '<%= config.bin %> <%= command.id %> --clear',
  ]
static flags = {
    ...connectionFlags,
    clear: Flags.boolean({description: 'Hapus domain, kembali ke host:port'}),
    set: Flags.string({description: 'Domain untuk registry self-hosted'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(RegistryDomain)

    if (Boolean(flags.set) === flags.clear) {
      this.error('Beri salah satu: --set <domain> atau --clear.')
    }

    let config: Awaited<ReturnType<typeof loadCredentials>>
    try {
      config = await loadCredentials(this.config.configDir, flags)
    } catch (error) {
      if (error instanceof MissingCredentialsError) {
        this.error(error.message, {suggestions: ['Jalankan `aoox login` dulu ke panel ini.']})
      }

      throw error
    }

    const registries = await api<Registry[]>(config, '/registries')
    const registry = registries.find((r) => r.type === 'self-hosted')
    if (!registry) {
      this.error('Belum ada registry self-hosted di panel ini.', {
        suggestions: ['Provision dulu dari Settings -> Registry.'],
      })
    }

    try {
      const updated = await api<Registry>(config, `/registries/${registry.id}/domain`, {
        body: {domain: flags.clear ? null : flags.set},
        method: 'PATCH',
      })
      this.log(flags.clear ? `Domain dihapus. Registry kembali di ${updated.url}.` : `Domain diterapkan: ${updated.url}`)
    } catch (error) {
      if (error instanceof ApiError && error.status === 400) {
        this.error(error.message, {
          suggestions: ['Pastikan proxy sudah di-provision dan PROXY_ACME_EMAIL sudah diisi.'],
        })
      }

      throw error
    }
  }
}
