import {Args} from '@oclif/core'

import type {ProjectEnvironment} from '../../lib/types.js'

import {api, ApiError} from '../../lib/api.js'
import {EnvCommand, environmentFlag, projectFlags} from '../../lib/env-command.js'
import {EnvInputError, parseKeys, unsetVariables} from '../../lib/env-text.js'

export default class EnvUnset extends EnvCommand {
  static args = {
    keys: Args.string({description: 'Variable name(s) to remove', required: true}),
  }
  static description =
    'Remove one or more variables from an environment. Comments and the other variables are kept; the write fails if someone else changed the environment in between'
  static examples = [
    '<%= config.bin %> <%= command.id %> OLD_KEY',
    '<%= config.bin %> <%= command.id %> A B --env staging',
  ]
  static flags = {...projectFlags, ...environmentFlag}
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
      this.warn(`Not set in ${resolved.environment.name}: ${result.missing.join(', ')}`)
    }

    if (result.removed.length === 0) {
      this.log('Nothing to remove.')
      return
    }

    const expectedUpdatedAt = current.updatedAt ?? resolved.environment.updatedAt
    let saved: ProjectEnvironment
    try {
      saved = await api<ProjectEnvironment>(
        resolved.config,
        `/projects/${resolved.projectId}/environments/${resolved.environment.id}`,
        {body: {action: 'unset', expectedUpdatedAt, variables: result.text}, method: 'PUT'},
      )
    } catch (error) {
      if (error instanceof ApiError) {
        // E.g. another variable still refers to the removed one with ${{project.KEY}}.
        if (error.status === 400) this.fail(error.message)
        this.failFromApi(error, {environment: resolved.environment.name, verb: 'change'})
      }

      throw error
    }

    this.log(`${resolved.environment.name}: removed ${result.removed.join(', ')} (${saved.keys.length} variable${saved.keys.length === 1 ? '' : 's'} left)`)
    if (saved.usedBy.length > 0) {
      this.log(`Used by ${saved.usedBy.map((u) => u.name).join(', ')}: they pick the change up on their next deploy.`)
    }
  }
}
