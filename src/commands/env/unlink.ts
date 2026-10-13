import {Flags} from '@oclif/core'

import type {LinkView} from '../../lib/types.js'

import {ownerFlags} from '../../lib/env-command.js'
import {connectionFlags} from '../../lib/flags.js'
import {LinkCommand} from '../../lib/link-command.js'
import {findLink, removeLink, SelectionError} from '../../lib/variable-sets.js'

export default class EnvUnlink extends LinkCommand {
  static description =
    'Remove a variable set environment from the linked application (or --stack). Name it with --set and --env, or with its --position from `aoox env links`. Takes effect on the next deploy'
  static enableJsonFlag = true
  static examples = [
    '<%= config.bin %> <%= command.id %> --set shared --env staging',
    '<%= config.bin %> <%= command.id %> --position 2',
  ]
  static flags = {
    ...connectionFlags,
    ...ownerFlags,
    env: Flags.string({char: 'e', description: 'Environment of the set'}),
    position: Flags.integer({description: '1-based position as shown by `aoox env links`', exclusive: ['set', 'env']}),
    set: Flags.string({char: 's', description: 'Variable set slug (or name)'}),
  }

  async run(): Promise<LinkView[]> {
    const {flags} = await this.parse(EnvUnlink)
    if (flags.position === undefined && (!flags.set || !flags.env)) {
      this.fail('Name the link with --set and --env, or with --position.', 'See them with: aoox env links')
    }

    const {config, link} = await this.connect(flags)
    const owner = (await this.resolveOwner(config, link, flags, true))!
    let next
    try {
      const target = findLink(owner.detail.variableSets, flags)
      next = removeLink(
        [...owner.detail.variableSets].sort((a, b) => a.position - b.position).map((l) => ({environmentId: l.environmentId})),
        target.environmentId,
      )
    } catch (error) {
      if (error instanceof SelectionError) this.fail(error.message, ...error.hints)
      throw error
    }

    return this.replaceLinks(config, owner, next)
  }
}
