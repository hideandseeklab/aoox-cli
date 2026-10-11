import {input, password} from '@inquirer/prompts'
import {Command, ux} from '@oclif/core'

import type {AuthUser} from '../lib/types.js'

import {api, ApiError} from '../lib/api.js'
import {normalizeUrl, readConfig, writeConfig} from '../lib/config.js'
import {connectionFlags} from '../lib/flags.js'

const DEFAULT_URL = 'http://localhost:3001'

export default class Login extends Command {
  static description = 'Save the panel URL and API token for other commands'
  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --url https://panel.example.com --token aoox_xxx',
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

    const url = normalizeUrl(
      flags.url ?? (await input({default: existing?.url ?? DEFAULT_URL, message: 'Panel URL'})),
    )
    // Prompted rather than taken as an argument by default: a token on the
    // command line ends up in shell history and in the process list.
    const token = (flags.token ?? (await password({mask: '*', message: 'API token (aoox_…)'}))).trim()

    const user = await this.verify({token, url})
    const path = await writeConfig(this.config.configDir, {token, url})

    this.log(`Logged in as ${user.email} (${user.role}) at ${url}`)
    this.log(`Token saved to ${path}`)
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

      throw error
    }
  }
}
