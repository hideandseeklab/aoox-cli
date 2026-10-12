import {input, password} from '@inquirer/prompts'
import {Command, ux} from '@oclif/core'

import type {Discovered} from '../lib/discovery.js'
import type {AuthUser} from '../lib/types.js'

import {api, ApiError} from '../lib/api.js'
import {readConfig, writeConfig} from '../lib/config.js'
import {discover, DiscoveryError} from '../lib/discovery.js'
import {connectionFlags} from '../lib/flags.js'
import {warnIfOutdated} from '../lib/outdated.js'

const DEFAULT_URL = 'http://localhost:3000'

export default class Login extends Command {
  static description =
    'Save the dashboard address and API token for other commands (the API address is discovered automatically)'
  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --url https://dashboard.example.com --token aoox_xxx',
    '<%= config.bin %> <%= command.id %> --url 203.0.113.10:3000 --token aoox_xxx',
  ]
  static flags = {...connectionFlags}

  async run(): Promise<void> {
    const {flags} = await this.parse(Login)
    const existing = await readConfig(this.config.configDir)

    // Prompting needs a terminal; in CI the flags (or AOOX_*) must carry it.
    if ((!flags.url || !flags.token) && !process.stdin.isTTY) {
      this.error('No interactive terminal.', {
        suggestions: ['Pass --url and --token, or set AOOX_URL and AOOX_TOKEN.'],
      })
    }

    const found = flags.url ? await this.discoverOrFail(flags.url) : await this.promptForDashboard(existing?.webUrl)
    for (const note of found.notes) this.log(note)

    // Prompted rather than taken as an argument by default: a token on the
    // command line ends up in shell history and in the process list.
    const token = (flags.token ?? (await password({mask: '*', message: 'API token (aoox_…)'}))).trim()

    const user = await this.verify({token, url: found.apiUrl})
    const path = await writeConfig(this.config.configDir, {
      token,
      url: found.apiUrl,
      ...(found.webUrl ? {webUrl: found.webUrl} : {}),
    })

    this.log(`Logged in as ${user.email} (${user.role}) at ${found.webUrl ?? found.apiUrl}`)
    this.log(`Token saved to ${path}`)
    await warnIfOutdated((m) => this.warn(m), this.config.version, {token, url: found.apiUrl}, user.version)
  }

  private async discoverOrFail(raw: string): Promise<Discovered> {
    ux.action.start('Looking for the panel')
    try {
      const found = await discover(raw)
      ux.action.stop('ok')
      return found
    } catch (error) {
      ux.action.stop('failed')
      if (error instanceof DiscoveryError) this.error(error.message)
      throw error
    }
  }

  private async promptForDashboard(previous?: string): Promise<Discovered> {
    this.log('Use the address you open the dashboard with: your panel domain (e.g. https://dashboard.example.com),')
    this.log('or http://<server-IP>:3000 if no panel domain is set yet.')
    // A wrong address is the commonest mistake; explain it and ask again instead of exiting.
    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      const raw = await input({default: previous ?? DEFAULT_URL, message: 'Dashboard URL'})
      try {
        ux.action.start('Looking for the panel')
        // eslint-disable-next-line no-await-in-loop
        const found = await discover(raw)
        ux.action.stop('ok')
        return found
      } catch (error) {
        ux.action.stop('failed')
        if (!(error instanceof DiscoveryError)) throw error
        this.log(error.message)
      }
    }
  }

  /** Never store a credential that does not work — check it first. */
  private async verify(config: {token: string; url: string}): Promise<AuthUser> {
    ux.action.start('Verifying token')
    try {
      const user = await api<AuthUser>(config, '/auth/me')
      ux.action.stop('ok')
      return user
    } catch (error) {
      ux.action.stop('failed')
      if (error instanceof ApiError && error.status === 401) {
        this.error('The panel rejected the token.', {
          suggestions: [
            'Make sure the token has not expired or been deleted.',
            'Create a new token in the panel: Settings → Account → API token.',
          ],
        })
      }

      if (error instanceof ApiError && error.status === 0) this.error(error.message)
      throw error
    }
  }
}
