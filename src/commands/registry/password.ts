import {Command, Flags} from '@oclif/core'

import type {Registry, RegistryCredentials} from '../../lib/types.js'

import {api, ApiError} from '../../lib/api.js'
import {MissingCredentialsError} from '../../lib/config.js'
import {connectionFlags, loadCredentials} from '../../lib/flags.js'
import {warnIfOutdated} from '../../lib/outdated.js'
import {successLine, warnLine} from '../../lib/style.js'

/**
 * Shows or resets the self-hosted registry's password — the CLI equivalent of
 * Settings -> Registry -> "Show password" / "Reset password". A reset keeps
 * every image (only the login changes), but every client using the old
 * password has to `docker login` again.
 */
export default class RegistryPassword extends Command {
  static description = 'Show or reset the password of the self-hosted registry'
  static examples = [
    '<%= config.bin %> <%= command.id %> --show',
    '<%= config.bin %> <%= command.id %> --reset --yes',
  ]
  static flags = {
    ...connectionFlags,
    reset: Flags.boolean({description: 'Generate a new password (owner only). Images are kept; docker login again afterwards'}),
    show: Flags.boolean({description: 'Print the current username, address and password'}),
    yes: Flags.boolean({char: 'y', description: 'Confirm --reset without asking'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(RegistryPassword)

    if (flags.show === flags.reset) {
      this.error('Pass one of: --show or --reset.')
    }

    if (flags.reset && !flags.yes) {
      this.error('Resetting the password logs out every client and CI job that uses the old one (docker login again).', {
        suggestions: ['Re-run with --yes to confirm.'],
      })
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

    await warnIfOutdated((m) => this.logToStderr(warnLine(m)), this.config.version, config)

    const registries = await api<Registry[]>(config, '/registries')
    const registry = registries.find((r) => r.type === 'self-hosted')
    if (!registry) {
      this.error('There is no self-hosted registry in this panel yet.', {
        suggestions: ['Provision one first from Settings -> Registry.'],
      })
    }

    try {
      if (flags.reset) {
        const fresh = await api<{password: string; username: string}>(config, '/registries/self-hosted/password', {method: 'POST'})
        this.log(successLine('Password reset. Images were not touched.'))
        this.log(`  username: ${fresh.username}`)
        this.log(`  password: ${fresh.password}`)
        this.log(`Log in again with: docker login ${registry.url} -u ${fresh.username}`)
        return
      }

      const creds = await api<RegistryCredentials>(config, `/registries/${registry.id}/credentials`)
      this.log(`  address:  ${creds.url}`)
      this.log(`  username: ${creds.username ?? ''}`)
      this.log(`  password: ${creds.password ?? ''}`)
    } catch (error) {
      if (error instanceof ApiError && (error.status === 403 || error.status === 404 || error.status === 502)) {
        this.error(error.message)
      }

      throw error
    }
  }
}
