import {Command, Flags} from '@oclif/core'

import {api, ApiError} from '../../lib/api.js'
import {MissingCredentialsError} from '../../lib/config.js'
import {connectionFlags, loadCredentials} from '../../lib/flags.js'
import {warnIfOutdated} from '../../lib/outdated.js'

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
export default class UpdatePanel extends Command {
  static description = 'Check for or apply updates to the aoox panel itself (the aoox-api and aoox-web images)'
  static examples = ['<%= config.bin %> <%= command.id %>', '<%= config.bin %> <%= command.id %> --apply']
  static flags = {
    ...connectionFlags,
    apply: Flags.boolean({description: 'Apply the update if one is available (pull + restart)'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(UpdatePanel)

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

    const status = await api<InstanceUpdateStatus>(config, '/instance/update')
    this.log(`Running version: ${status.currentVersion}`)
    this.printImage('api', status.api)
    this.printImage('web', status.web)

    const available = status.api.updateAvailable || status.web.updateAvailable
    if (!available) {
      this.log('Already up to date.')
      return
    }

    if (!flags.apply) {
      this.log('An update is available. Run with --apply to apply it.')
      return
    }

    try {
      await api(config, '/instance/update/apply', {method: 'POST'})
    } catch (error) {
      if (error instanceof ApiError && error.status === 400) {
        this.error(error.message, {
          suggestions: ['Make sure INSTALL_DIR is set in the panel .env.dist, then restart the stack and try again.'],
        })
      }

      throw error
    }

    this.log('Update applied — the panel will restart for a few seconds to apply it.')
  }

  private printImage(label: string, status: ImageUpdateStatus): void {
    const state = status.currentDigest === null ? 'new baseline' : status.updateAvailable ? 'update available' : 'up to date'
    this.log(`  ${label}: ${status.image} (${state})`)
  }
}
