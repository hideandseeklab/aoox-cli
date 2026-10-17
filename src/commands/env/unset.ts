import {Args} from '@oclif/core'

import {EnvCommand, environmentCommandFlags} from '../../lib/env-command.js'
import {EnvInputError, parseKeys, unsetVariables} from '../../lib/env-text.js'
import {successLine, warnLine} from '../../lib/style.js'

export default class EnvUnset extends EnvCommand {
  static args = {
    keys: Args.string({description: 'Variable name(s) to remove', required: true}),
  }
  static description =
    'Remove one or more variables from a variable set environment. Comments and the other variables are kept; the write fails if someone else changed the environment in between'
  static examples = [
    '<%= config.bin %> <%= command.id %> OLD_KEY',
    '<%= config.bin %> <%= command.id %> A B --set shared --env staging',
  ]
  static flags = {...environmentCommandFlags}
  static strict = false

  async run(): Promise<void> {
    const {argv, flags} = await this.parse(EnvUnset)
    let keys
    try {
      keys = parseKeys(argv as string[])
    } catch (error) {
      if (error instanceof EnvInputError) this.fail(error.message)
      throw error
    }

    const resolved = await this.resolveEnvironment(flags)
    const current = await this.reveal(resolved, 'change')
    const result = unsetVariables(current.variables, keys)
    if (result.missing.length > 0) {
      this.logToStderr(warnLine(`Not set in ${resolved.label}: ${result.missing.join(', ')}`))
    }

    if (result.removed.length === 0) {
      this.log('Nothing to remove.')
      return
    }

    const saved = await this.saveEnvironment(resolved, {
      action: 'unset',
      expectedUpdatedAt: current.updatedAt,
      variables: result.text,
    })
    this.log(successLine(`${resolved.label}: removed ${result.removed.join(', ')} (${saved.keys.length} variable${saved.keys.length === 1 ? '' : 's'} left)`))
    this.usedByNote(saved)
  }
}
