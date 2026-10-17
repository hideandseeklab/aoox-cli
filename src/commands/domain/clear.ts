import {confirm} from '@inquirer/prompts'
import {Command, Flags} from '@oclif/core'

import {api, ApiError} from '../../lib/api.js'
import {MissingCredentialsError} from '../../lib/config.js'
import {connectionFlags, loadCredentials} from '../../lib/flags.js'
import {warnIfOutdated} from '../../lib/outdated.js'
import {successLine, warnLine} from '../../lib/style.js'

interface ClearPanelDomainResult {
  reopenUrl: null | string
}

/**
 * Counterpart of `aoox domain set`: calls the panel's `DELETE /instance/domain`,
 * which takes the dashboard and API back to plain IP access and recreates the
 * web/api containers. The reverse proxy and application domains are untouched.
 */
export default class DomainClear extends Command {
  static description = 'Remove the custom domain of the panel itself and go back to IP access (IP:3000) through the running panel API'
  static examples = ['<%= config.bin %> <%= command.id %>', '<%= config.bin %> <%= command.id %> --yes']
  static flags = {
    ...connectionFlags,
    yes: Flags.boolean({char: 'y', default: false, description: 'Do not ask for confirmation'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(DomainClear)

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

    if (!flags.yes) {
      const ok = await confirm({
        default: false,
        message:
          'Remove the panel domain? The dashboard and API go back to http://<server IP>:3000 / :3001 after a short restart, and this domain stops working. Applications and their domains are not touched.',
      })
      if (!ok) this.exit(0)
    }

    let result: ClearPanelDomainResult
    try {
      result = await api<ClearPanelDomainResult>(config, '/instance/domain', {method: 'DELETE'})
    } catch (error) {
      if (error instanceof ApiError && error.status === 400) {
        this.error(error.message, {
          suggestions: ['If INSTALL_DIR is missing, set it in the panel .env.dist, restart the stack and try again.'],
        })
      }

      if (error instanceof ApiError && error.status === 502) {
        this.error(error.message, {suggestions: ['Start Docker on the panel host and try again.']})
      }

      throw error
    }

    this.log(successLine('Panel domain removed.'))
    this.log('The panel will restart for a few seconds to go back to IP access — the connection to this API will drop briefly.')
    this.log(`Reopen the dashboard at ${result.reopenUrl ?? 'http://<server IP>:3000'} afterwards.`)
    this.log('Run `aoox login` again with that address if you used the domain to sign in.')
  }
}
