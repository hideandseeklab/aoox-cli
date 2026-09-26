import {Command, Flags} from '@oclif/core'

import {api, ApiError} from '../../lib/api.js'
import {MissingCredentialsError} from '../../lib/config.js'
import {connectionFlags, loadCredentials} from '../../lib/flags.js'

interface PanelDomainSettings {
  acmeEmail: null | string
  apiHost: null | string
  updatedAt: null | string
  webHost: null | string
}

/**
 * Post-install alternative to hand-editing docker-compose.domain.yml/.env.dist
 * over SSH (see RELEASING.md-adjacent AGENTS.md "Domain untuk panel sendiri"):
 * calls the panel's own `PATCH /instance/domain`, which recreates its web/api
 * containers. Requires INSTALL_DIR to already be set in the panel's .env.dist.
 */
export default class DomainSet extends Command {
  static description = "Set domain kustom untuk panel itu sendiri (bukan aplikasi) lewat API panel yang sudah jalan"
  static examples = [
    '<%= config.bin %> <%= command.id %> --web panel.example.com --api api.example.com',
    '<%= config.bin %> <%= command.id %> --web panel.example.com --api api.example.com --acme-email you@example.com',
  ]
static flags = {
    ...connectionFlags,
    'acme-email': Flags.string({description: "Email untuk sertifikat Let's Encrypt"}),
    api: Flags.string({description: 'Domain untuk API panel', required: true}),
    web: Flags.string({description: 'Domain untuk dashboard panel', required: true}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(DomainSet)

    let config: Awaited<ReturnType<typeof loadCredentials>>
    try {
      config = await loadCredentials(this.config.configDir, flags)
    } catch (error) {
      if (error instanceof MissingCredentialsError) {
        this.error(error.message, {suggestions: ['Jalankan `aoox login` dulu ke panel ini.']})
      }

      throw error
    }

    try {
      await api<PanelDomainSettings>(config, '/instance/domain', {
        body: {
          ...(flags['acme-email'] ? {acmeEmail: flags['acme-email']} : {}),
          apiHost: flags.api,
          webHost: flags.web,
        },
        method: 'PATCH',
      })
    } catch (error) {
      if (error instanceof ApiError && error.status === 400) {
        this.error(error.message, {
          suggestions: ['Pastikan INSTALL_DIR sudah diisi di .env.dist panel, lalu restart stack dan coba lagi.'],
        })
      }

      throw error
    }

    this.log(`Domain disimpan: ${flags.web} (dashboard), ${flags.api} (API).`)
    this.log('Panel akan restart beberapa detik untuk menerapkannya — koneksi ke API ini akan sempat terputus.')
  }
}
