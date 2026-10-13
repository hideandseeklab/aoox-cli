import {Flags} from '@oclif/core'

import type {EnvironmentVersion} from '../../lib/types.js'

import {api} from '../../lib/api.js'
import {EnvCommand, environmentCommandFlags} from '../../lib/env-command.js'
import {describeSummary} from '../../lib/env-plan.js'

export default class EnvHistory extends EnvCommand {
  static description =
    'Show the version history of a variable set environment: when, who, and which variable names were added (+), changed (~) or removed (-). Values are never shown'
  static enableJsonFlag = true
  static examples = [
    '<%= config.bin %> <%= command.id %> --set shared --env production',
    '<%= config.bin %> <%= command.id %> --limit 5 --json',
  ]
  static flags = {
    ...environmentCommandFlags,
    limit: Flags.integer({default: 20, description: 'How many versions to show (newest first)', min: 1}),
  }

  async run(): Promise<EnvironmentVersion[]> {
    const {flags} = await this.parse(EnvHistory)
    const resolved = await this.resolveEnvironment(flags)
    let versions: EnvironmentVersion[]
    try {
      versions = await api<EnvironmentVersion[]>(
        resolved.config,
        `/variable-sets/${resolved.set.id}/environments/${resolved.environment.id}/versions`,
      )
    } catch (error) {
      return this.failFromApi(error, {environment: resolved.label})
    }

    this.log(`Environment: ${resolved.label}`)
    if (versions.length === 0) {
      this.log('No versions yet: the first change creates one.')
      return []
    }

    const shown = versions.slice(0, flags.limit)
    const when = (v: EnvironmentVersion) => new Date(v.createdAt).toISOString().replace('T', ' ').slice(0, 19)
    const who = (v: EnvironmentVersion) => `${v.authorEmail ?? 'system'}${v.via === 'token' ? ' (token)' : ''}`
    const w = {
      action: Math.max(6, ...shown.map((v) => v.action.length)),
      who: Math.max(3, ...shown.map((v) => who(v).length)),
    }
    this.log(`${'WHEN (UTC)'.padEnd(19)}  ${'WHO'.padEnd(w.who)}  ${'ACTION'.padEnd(w.action)}  CHANGE`)
    for (const v of shown) {
      const detail = v.detail && v.action !== 'baseline' ? ` (${v.detail})` : ''
      this.log(
        `${when(v).padEnd(19)}  ${who(v).padEnd(w.who)}  ${v.action.padEnd(w.action)}  ${describeSummary(v.summary)}${detail}${v.current ? '  <- current' : ''}`,
      )
    }

    const older = versions.length - shown.length
    if (older > 0) this.log(`... ${older} older version${older === 1 ? '' : 's'} (use --limit)`)
    return shown
  }
}
