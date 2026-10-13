import {Flags} from '@oclif/core'

import type {LinkView, VariableSetSummary} from '../../lib/types.js'

import {api} from '../../lib/api.js'
import {ownerFlags} from '../../lib/env-command.js'
import {connectionFlags} from '../../lib/flags.js'
import {LinkCommand} from '../../lib/link-command.js'
import {addLink, findSet, pickEnvironment, SelectionError} from '../../lib/variable-sets.js'

export default class EnvLink extends LinkCommand {
  static description =
    'Link a variable set environment to the linked application (or --stack). It is added last, so it wins over the other links, unless --position is given; an environment that is already linked is moved. Takes effect on the next deploy'
  static enableJsonFlag = true
  static examples = [
    '<%= config.bin %> <%= command.id %> --set shared --env production',
    '<%= config.bin %> <%= command.id %> --set defaults --env production --position 1',
  ]
  static flags = {
    ...connectionFlags,
    ...ownerFlags,
    env: Flags.string({char: 'e', description: 'Environment of the set', required: true}),
    position: Flags.integer({description: '1-based place in the list (1 = first, overridden by every later link). Default: last'}),
    set: Flags.string({char: 's', description: 'Variable set slug (or name)', required: true}),
  }

  async run(): Promise<LinkView[]> {
    const {flags} = await this.parse(EnvLink)
    const {config, link} = await this.connect(flags)
    const owner = (await this.resolveOwner(config, link, flags, true))!
    let sets: VariableSetSummary[]
    try {
      sets = await api<VariableSetSummary[]>(config, '/variable-sets')
    } catch (error) {
      return this.failFromApi(error)
    }

    let next
    try {
      const set = findSet(sets, flags.set)
      if (!set) {
        throw new SelectionError(`Variable set "${flags.set}" not found.`, [
          `Sets you can see: ${sets.map((s) => s.slug).join(', ') || 'none'}`,
        ])
      }

      const environment = pickEnvironment(set, flags.env)
      const current = [...owner.detail.variableSets]
        .sort((a, b) => a.position - b.position)
        .map((l) => ({environmentId: l.environmentId}))
      next = addLink(current, environment.id, flags.position)
    } catch (error) {
      if (error instanceof SelectionError) this.fail(error.message, ...error.hints)
      throw error
    }

    return this.replaceLinks(config, owner, next)
  }
}
