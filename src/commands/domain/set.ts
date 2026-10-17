import {Command, Flags} from '@oclif/core'

import {api, ApiError} from '../../lib/api.js'
import {MissingCredentialsError} from '../../lib/config.js'
import {connectionFlags, loadCredentials} from '../../lib/flags.js'
import {warnIfOutdated} from '../../lib/outdated.js'
import {successLine, warnLine} from '../../lib/style.js'

interface PanelDomainSettings {
  acmeEmail: null | string
  apiHost: null | string
  updatedAt: null | string
  webHost: null | string
}

interface UpdatePanelDomainResult {
  proxyAutoProvisioned: boolean
  restrictPortsNote: null | string
  settings: PanelDomainSettings
}

/**
 * Post-install alternative to hand-editing docker-compose.domain.yml/.env.dist
 * over SSH (see the aoox-api AGENTS.md "Domains for the panel itself"):
 * calls the panel's own `PATCH /instance/domain`, which recreates its web/api
 * containers. Requires INSTALL_DIR to already be set in the panel's .env.dist.
 */
export default class DomainSet extends Command {
  static description = "Set a custom domain for the panel itself (not an application) through the running panel API"
  static examples = [
    '<%= config.bin %> <%= command.id %> --web panel.example.com --api api.example.com',
    '<%= config.bin %> <%= command.id %> --web panel.example.com --api api.example.com --acme-email you@example.com',
    '<%= config.bin %> <%= command.id %> --web panel.example.com --api api.example.com --domain-only',
  ]
static flags = {
    ...connectionFlags,
    'acme-email': Flags.string({description: "Email for the Let's Encrypt certificate"}),
    api: Flags.string({description: 'Domain for the panel API', required: true}),
    'domain-only': Flags.boolean({
      allowNo: true,
      description:
        'Only allow access through the domain: ports 3000/3001 listen on 127.0.0.1 only (default: keep the current setting). Use --no-domain-only to open them again. Make sure the domain works first, or you lose IP:port access',
    }),
    web: Flags.string({description: 'Domain for the panel dashboard', required: true}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(DomainSet)

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

    let result: UpdatePanelDomainResult
    try {
      result = await api<UpdatePanelDomainResult>(config, '/instance/domain', {
        body: {
          ...(flags['acme-email'] ? {acmeEmail: flags['acme-email']} : {}),
          apiHost: flags.api,
          ...(flags['domain-only'] === undefined ? {} : {restrictPorts: flags['domain-only']}),
          webHost: flags.web,
        },
        method: 'PATCH',
      })
    } catch (error) {
      if (error instanceof ApiError && error.status === 400) {
        this.error(error.message, {
          suggestions: ['Make sure INSTALL_DIR is set in the panel .env.dist, then restart the stack and try again.'],
        })
      }

      throw error
    }

    this.log(successLine(`Domain saved: ${flags.web} (dashboard), ${flags.api} (API).`))
    this.log('The panel will restart for a few seconds to apply it — the connection to this API will drop briefly.')

    if (result.restrictPortsNote) {
      this.log('')
      this.logToStderr(warnLine('Access through IP:3000 / IP:3001 is closed once the panel restarts — use the domains above.'))
      this.log(result.restrictPortsNote)
    }

    if (result.proxyAutoProvisioned) {
      this.log('')
      this.logToStderr(warnLine('The reverse proxy was not running before — it has been enabled automatically.'))
      this.log('The new domains will be reachable only if these three things are also correct:')
      this.log(`  1. DNS A records for ${flags.web} and ${flags.api} point to this server's IP.`)
      this.log('  2. Ports 80 and 443 are open to the public (both the OS firewall and the VPS provider security group).')
      this.log("  3. Wait up to a minute — the HTTPS certificate (Let's Encrypt) is issued when the first domain is accessed.")
    }
  }
}
