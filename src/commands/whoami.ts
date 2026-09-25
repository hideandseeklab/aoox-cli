import {Command} from '@oclif/core'

import type {AuthUser} from '../lib/types.js'

import {api, ApiError} from '../lib/api.js'
import {MissingCredentialsError} from '../lib/config.js'
import {connectionFlags, loadCredentials} from '../lib/flags.js'

export interface WhoamiResult extends AuthUser {
  url: string
}

export default class Whoami extends Command {
  static description = 'Tampilkan akun dan panel yang sedang dipakai'
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
        this.error(error.message, {suggestions: ['Jalankan `aoox login`.']})
      }

      throw error
    }

    let user: AuthUser
    try {
      user = await api<AuthUser>(config, '/auth/me')
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        this.error('Token tidak berlaku lagi.', {suggestions: ['Jalankan `aoox login` untuk menyimpan token baru.']})
      }

      throw error
    }

    // Muted automatically when --json is set, so the JSON output stays clean.
    this.log(`${user.email} · ${user.role}${user.name ? ` · ${user.name}` : ''}`)
    this.log(`Panel: ${config.url}`)

    return {...user, url: config.url}
  }
}
