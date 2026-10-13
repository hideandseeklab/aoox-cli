import {Args, Flags} from '@oclif/core'

import {EnvCommand, environmentCommandFlags} from '../../lib/env-command.js'
import {ENV_TEXT_MAX, EnvInputError, parseAssignments, setVariables} from '../../lib/env-text.js'
import {PROJECT_REFERENCE_HINT, projectReferenceKeys} from '../../lib/variable-sets.js'

export default class EnvSet extends EnvCommand {
  static args = {
    assignments: Args.string({description: 'KEY=VALUE (the value is stored exactly as given)', required: true}),
  }
  static description =
    'Set one or more variables in a variable set environment. Existing comments and order are kept; the write fails if someone else changed the environment in between'
  static examples = [
    '<%= config.bin %> <%= command.id %> API_URL=https://api.example.com --set shared --env production',
    '<%= config.bin %> <%= command.id %> GREETING="hello world" QUERY=a=b --env staging',
    '<%= config.bin %> <%= command.id %> API_TOKEN=abc123 --secret',
  ]
  static flags = {
    ...environmentCommandFlags,
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

    const old = projectReferenceKeys(pairs.map(([k, v]) => `${k}=${v}`).join('\n'))
    if (old.length > 0) this.fail(`${old.join(', ')}: ${PROJECT_REFERENCE_HINT}`)

    const resolved = await this.resolveEnvironment(flags)
    const current = await this.reveal(resolved, 'change')
    const result = setVariables(current.variables, pairs)
    if (result.text.length > ENV_TEXT_MAX) {
      this.fail(`The environment would exceed ${ENV_TEXT_MAX} characters.`)
    }

    const saved = await this.saveEnvironment(resolved, {
      action: 'set',
      expectedUpdatedAt: current.updatedAt,
      variables: result.text,
      ...(flags.secret === undefined ? {} : {flags: Object.fromEntries(pairs.map(([k]) => [k, flags.secret!]))}),
    })

    const mark = flags.secret === undefined ? '' : flags.secret ? ' (secret)' : ' (not secret)'
    const parts = [
      result.added.length > 0 ? `added ${result.added.join(', ')}` : '',
      result.updated.length > 0 ? `updated ${result.updated.join(', ')}` : '',
    ].filter(Boolean)
    if (parts.length > 0) parts[parts.length - 1] += mark
    this.log(`${resolved.label}: ${parts.join('; ')} (${saved.keys.length} variable${saved.keys.length === 1 ? '' : 's'} now)`)
    this.usedByNote(saved)
  }
}
