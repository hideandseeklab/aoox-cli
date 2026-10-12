import {Args, Flags} from '@oclif/core'

import type {ProjectEnvironment} from '../../lib/types.js'

import {api, ApiError} from '../../lib/api.js'
import {EnvCommand, environmentFlag, projectFlags} from '../../lib/env-command.js'
import {ENV_TEXT_MAX, EnvInputError, parseAssignments, setVariables} from '../../lib/env-text.js'

export default class EnvSet extends EnvCommand {
  static args = {
    assignments: Args.string({description: 'KEY=VALUE (the value is stored exactly as given)', required: true}),
  }
  static description =
    'Set one or more variables in an environment. Existing comments and order are kept; the write fails if someone else changed the environment in between'
  static examples = [
    '<%= config.bin %> <%= command.id %> API_URL=https://api.example.com',
    '<%= config.bin %> <%= command.id %> GREETING="hello world" QUERY=a=b --env staging',
    '<%= config.bin %> <%= command.id %> API_TOKEN=abc123 --secret',
  ]
  static flags = {
    ...projectFlags,
    ...environmentFlag,
    secret: Flags.boolean({
      allowNo: true,
      description:
        'Mark the variables as secret (--secret: always masked in logs) or explicitly not secret (--no-secret: never masked). Without either the flag is left as it is',
    }),
  }
  static strict = false

  async run(): Promise<void> {
    const {argv, flags} = await this.parse(EnvSet)
    let pairs
    try {
      pairs = parseAssignments(argv as string[])
    } catch (error) {
      if (error instanceof EnvInputError) this.fail(error.message)
      throw error
    }

    const resolved = await this.resolveEnvironment(flags)
    const current = await this.reveal(resolved, 'change')
    const result = setVariables(current.variables, pairs)
    if (result.text.length > ENV_TEXT_MAX) {
      this.fail(`The environment would exceed ${ENV_TEXT_MAX} characters.`)
    }

    // The version we read; an older panel without it falls back to the list's.
    const expectedUpdatedAt = current.updatedAt ?? resolved.environment.updatedAt
    let saved: ProjectEnvironment
    try {
      saved = await api<ProjectEnvironment>(
        resolved.config,
        `/projects/${resolved.projectId}/environments/${resolved.environment.id}`,
        {
          body: {
            action: 'set',
            expectedUpdatedAt,
            variables: result.text,
            ...(flags.secret === undefined ? {} : {flags: Object.fromEntries(pairs.map(([k]) => [k, flags.secret]))}),
          },
          method: 'PUT',
        },
      )
    } catch (error) {
      if (error instanceof ApiError) {
        // A 400 is a problem with the text (e.g. a `${{project.X}}` reference to a missing variable).
        if (error.status === 400) this.fail(error.message)
        this.failFromApi(error, {environment: resolved.environment.name, verb: 'change'})
      }

      throw error
    }

    const mark = flags.secret === undefined ? '' : flags.secret ? ' (secret)' : ' (not secret)'
    const parts = [
      result.added.length > 0 ? `added ${result.added.join(', ')}` : '',
      result.updated.length > 0 ? `updated ${result.updated.join(', ')}` : '',
    ].filter(Boolean)
    if (parts.length > 0) parts[parts.length - 1] += mark
    this.log(`${resolved.environment.name}: ${parts.join('; ')} (${saved.keys.length} variable${saved.keys.length === 1 ? '' : 's'} now)`)
    if (saved.usedBy.length > 0) {
      this.log(`Used by ${saved.usedBy.map((u) => u.name).join(', ')}: they pick the change up on their next deploy.`)
    }
  }
}
