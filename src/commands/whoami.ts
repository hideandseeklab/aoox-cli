import {Command} from '@oclif/core'

import type {AuthUser} from '../lib/types.js'

import {api, ApiError} from '../lib/api.js'
import {MissingCredentialsError} from '../lib/config.js'
import {connectionFlags, loadCredentials} from '../lib/flags.js'
import {warnIfOutdated} from '../lib/outdated.js'

export interface WhoamiResult extends AuthUser {
  url: string
}

export default class Whoami extends Command {
  static description = 'Show the account and panel in use'
  static enableJsonFlag = true
  static examples = ['<%= config.bin %> <%= command.id %>', '<%= config.bin %> <%= command.id %> --json']
  static flags = {...connectionFlags}

  async run(): Promise<WhoamiResult> {
    const {flags} = await this.parse(Whoami)

    let config
    try {
      config = await loadCredentials(this.config.configDir, flags)
    } catch (error) {
      if (error instanceof MissingCredentialsError) {
        this.error(error.message, {suggestions: ['Run `aoox login`.']})
      }

      throw error
    }

    let user: AuthUser
    try {
      user = await api<AuthUser>(config, '/auth/me')
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        this.error('The token is no longer valid.', {suggestions: ['Run `aoox login` to save a new token.']})
      }

      throw error
    }

    // Muted automatically when --json is set, so the JSON output stays clean.
    this.log(`${user.email} · ${user.role}${user.name ? ` · ${user.name}` : ''}`)
    this.log(`Panel: ${config.url}`)

    await warnIfOutdated((m) => this.warn(m), this.config.version, config, user.version)

    return {...user, url: config.url}
  }
}
