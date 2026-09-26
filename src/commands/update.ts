import {Command, Flags} from '@oclif/core'

import {api, ApiError} from '../lib/api.js'
import {MissingCredentialsError} from '../lib/config.js'
import {connectionFlags, loadCredentials} from '../lib/flags.js'

interface ImageUpdateStatus {
  currentDigest: null | string
  image: string
  remoteDigest: string
  updateAvailable: boolean
}

interface InstanceUpdateStatus {
  api: ImageUpdateStatus
  checkedAt: null | string
  currentVersion: string
  installDirConfigured: boolean
  web: ImageUpdateStatus
}

/**
 * Checks the panel's own `aoox-api`/`aoox-web` images against the registry
 * (`GET /instance/update`) and, with `--apply`, pulls + restarts
 * (`POST /instance/update/apply`) — the CLI equivalent of Settings ->
 * "Update aoox".
 */
export default class Update extends Command {
  static description = 'Cek atau terapkan update untuk panel aoox itu sendiri'
  static examples = ['<%= config.bin %> <%= command.id %>', '<%= config.bin %> <%= command.id %> --apply']
static flags = {
    ...connectionFlags,
    apply: Flags.boolean({description: 'Terapkan update jika tersedia (pull + restart)'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Update)

    let config: Awaited<ReturnType<typeof loadCredentials>>
    try {
      config = await loadCredentials(this.config.configDir, flags)
    } catch (error) {
      if (error instanceof MissingCredentialsError) {
        this.error(error.message, {suggestions: ['Jalankan `aoox login` dulu ke panel ini.']})
      }

      throw error
    }

    const status = await api<InstanceUpdateStatus>(config, '/instance/update')
    this.log(`Versi berjalan: ${status.currentVersion}`)
    this.printImage('api', status.api)
    this.printImage('web', status.web)

    const available = status.api.updateAvailable || status.web.updateAvailable
    if (!available) {
      this.log('Sudah versi terbaru.')
      return
    }

    if (!flags.apply) {
      this.log('Update tersedia. Jalankan dengan --apply untuk menerapkannya.')
      return
    }

    try {
      await api(config, '/instance/update/apply', {method: 'POST'})
    } catch (error) {
      if (error instanceof ApiError && error.status === 400) {
        this.error(error.message, {
          suggestions: ['Pastikan INSTALL_DIR sudah diisi di .env.dist panel, lalu restart stack dan coba lagi.'],
        })
      }

      throw error
    }

    this.log('Update diterapkan — panel akan restart beberapa detik untuk menerapkannya.')
  }

  private printImage(label: string, status: ImageUpdateStatus): void {
    const state = status.currentDigest === null ? 'baseline baru' : status.updateAvailable ? 'update tersedia' : 'terbaru'
    this.log(`  ${label}: ${status.image} (${state})`)
  }
}
