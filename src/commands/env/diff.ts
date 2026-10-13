import {Flags} from '@oclif/core'

import type {EnvironmentDiff} from '../../lib/types.js'

import {api} from '../../lib/api.js'
import {EnvCommand, ownerFlags, selectorFlags} from '../../lib/env-command.js'
import {connectionFlags} from '../../lib/flags.js'

export default class EnvDiff extends EnvCommand {
  static description =
    'Compare two environments of a variable set key by key: which variables exist on one side only and which have different values. Prints names only, never values'
  static enableJsonFlag = true
  static examples = ['<%= config.bin %> <%= command.id %> --set shared --from staging --to production']
  static flags = {
    ...connectionFlags,
    ...ownerFlags,
    from: Flags.string({description: 'Environment to compare from', required: true}),
    set: selectorFlags.set,
    to: Flags.string({description: 'Environment to compare to', required: true}),
  }

  async run(): Promise<EnvironmentDiff> {
    const {flags} = await this.parse(EnvDiff)
    if (flags.from === flags.to) this.fail('Choose two different environments.')
    const {config, set} = await this.resolveSet(flags)
    let diff: EnvironmentDiff
    try {
      diff = await api<EnvironmentDiff>(
        config,
        `/variable-sets/${set.id}/diff?from=${encodeURIComponent(flags.from)}&to=${encodeURIComponent(flags.to)}`,
      )
    } catch (error) {
      return this.failFromApi(error)
    }

    this.log(`Set: ${set.slug} · ${diff.from.name} -> ${diff.to.name}`)
    this.section(`Only in ${diff.from.name}`, diff.onlyInFrom)
    this.section(`Only in ${diff.to.name}`, diff.onlyInTo)
    if (diff.comparable && diff.different && diff.same) {
      this.section('Different values', diff.different)
      this.log(`Same in both: ${diff.same.length}`)
      if (diff.onlyInFrom.length + diff.onlyInTo.length + diff.different.length === 0) {
        this.log('The two environments are identical.')
      }
    } else {
      this.log(`In both: ${diff.inBoth.length}`)
      this.log(
        'Values were not compared: you cannot read both environments (a protected environment needs an instance owner or admin, and a token scope can exclude one).',
      )
    }

    return diff
  }

  private section(title: string, names: string[]): void {
    if (names.length === 0) return
    this.log(`${title} (${names.length}):`)
    for (const n of names) this.log(`  ${n}`)
  }
}
