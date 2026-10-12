import {Args} from '@oclif/core'

import type {EnvironmentDiff} from '../../lib/types.js'

import {api} from '../../lib/api.js'
import {EnvCommand, projectFlags} from '../../lib/env-command.js'

export default class EnvDiff extends EnvCommand {
  static args = {
    from: Args.string({description: 'Environment to compare from', required: true}),
    to: Args.string({description: 'Environment to compare to', required: true}),
  }
  static description =
    'Compare two environments key by key: which variables exist on one side only and which have different values. Prints names only, never values'
  static enableJsonFlag = true
  static examples = ['<%= config.bin %> <%= command.id %> staging production']
  static flags = {...projectFlags}

  async run(): Promise<EnvironmentDiff> {
    const {args, flags} = await this.parse(EnvDiff)
    const {config, projectId, projectName} = await this.resolveProject(flags)
    let diff: EnvironmentDiff
    try {
      diff = await api<EnvironmentDiff>(
        config,
        `/projects/${projectId}/environments/diff?from=${encodeURIComponent(args.from)}&to=${encodeURIComponent(args.to)}`,
      )
    } catch (error) {
      return this.failFromApi(error)
    }

    this.log(`Project: ${projectName} · ${diff.from.name} -> ${diff.to.name}`)
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
      this.log('Values were not compared: you cannot read both environments (a protected environment needs a project admin).')
    }

    return diff
  }

  private section(title: string, names: string[]): void {
    if (names.length === 0) return
    this.log(`${title} (${names.length}):`)
    for (const n of names) this.log(`  ${n}`)
  }
}
