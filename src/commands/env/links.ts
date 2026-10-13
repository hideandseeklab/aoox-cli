import type {LinkView} from '../../lib/types.js'

import {EnvCommand, ownerFlags} from '../../lib/env-command.js'
import {connectionFlags} from '../../lib/flags.js'
import {describeLinks} from '../../lib/variable-sets.js'

export default class EnvLinks extends EnvCommand {
  static description =
    'Show the variable set environments the linked application (or --stack) uses, in merge order, with the variables a later link or the own env overrides'
  static enableJsonFlag = true
  static examples = ['<%= config.bin %> <%= command.id %>', '<%= config.bin %> <%= command.id %> --stack <id>']
  static flags = {...connectionFlags, ...ownerFlags}

  async run(): Promise<LinkView[]> {
    const {flags} = await this.parse(EnvLinks)
    const {config, link} = await this.connect(flags)
    const owner = (await this.resolveOwner(config, link, flags, true))!
    for (const line of describeLinks(owner.label, owner.detail.variableSets)) this.log(line)
    return owner.detail.variableSets
  }
}
