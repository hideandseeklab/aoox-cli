import {Command, Flags} from '@oclif/core'

import {api, ApiError} from '../../lib/api.js'
import {MissingCredentialsError} from '../../lib/config.js'
import {connectionFlags, loadCredentials} from '../../lib/flags.js'
import {warnIfOutdated} from '../../lib/outdated.js'
import {successLine, warnLine} from '../../lib/style.js'

interface ImageUpdateStatus {
  currentDigest: null | string
  error?: null | string
  image: string
  remoteDigest: null | string
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

    await warnIfOutdated((m) => this.logToStderr(warnLine(m)), this.config.version, config)

    let status: InstanceUpdateStatus
    try {
      status = await api<InstanceUpdateStatus>(config, '/instance/update')
    } catch (error) {
      if (error instanceof ApiError && error.status >= 500) {
        this.error(`The panel could not check for updates: ${error.message}`, {
          suggestions: ['Check the panel logs (docker compose logs api) and that API_IMAGE / WEB_IMAGE point at a reachable registry.'],
        })
      }

      throw error
    }

    this.log(`Running version: ${status.currentVersion}`)
    this.printImage('api', status.api)
    this.printImage('web', status.web)

    const failed = [status.api, status.web].filter((image) => image.error)
    for (const image of failed) this.logToStderr(warnLine(image.error ?? 'Registry lookup failed.'))
    if (failed.length > 0 && !status.api.updateAvailable && !status.web.updateAvailable) {
      this.error('Could not compare with the registry, so no update status is available.', {
        suggestions: ['Set API_IMAGE / WEB_IMAGE in the panel .env.dist to images the registry serves, or check its connectivity.'],
      })
    }

    const available = status.api.updateAvailable || status.web.updateAvailable
    if (!available) {
      this.log(successLine('Already up to date.'))
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

      if (error instanceof ApiError && error.status === 502) {
        this.error(error.message)
      }

      throw error
    }

    this.log(successLine('Update applied — the panel will restart for a few seconds to apply it.'))
  }

  private printImage(label: string, status: ImageUpdateStatus): void {
    const state = status.error ? 'lookup failed' : status.currentDigest === null ? 'new baseline' : status.updateAvailable ? 'update available' : 'up to date'
    this.log(`  ${label}: ${status.image} (${state})`)
  }
}
