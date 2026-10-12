import {Args, Flags} from '@oclif/core'

import {api, ApiError} from '../../lib/api.js'
import {EnvCommand, projectFlags, type Resolved} from '../../lib/env-command.js'
import {planPromotion} from '../../lib/env-plan.js'
import {EnvInputError, parseKeys} from '../../lib/env-text.js'

export default class EnvPromote extends EnvCommand {
  static args = {
    from: Args.string({description: 'Environment to copy the values from', required: true}),
    to: Args.string({description: 'Environment to copy the values into', required: true}),
  }
  static description =
    'Copy variables from one environment to another (name them, or use --all). Needs the right to read the source and to change the target. The target keeps its comments and order; new variables are appended. Shows what changes and asks before writing (unless --yes)'
  static examples = [
    '<%= config.bin %> <%= command.id %> staging production API_URL FEATURE_X',
    '<%= config.bin %> <%= command.id %> development staging --all --yes',
  ]
  static flags = {
    ...projectFlags,
    all: Flags.boolean({description: 'Promote every variable of the source (those already equal are skipped)'}),
    yes: Flags.boolean({char: 'y', description: 'Do not ask for confirmation'}),
  }
  static strict = false

  async run(): Promise<void> {
    const {args, argv, flags} = await this.parse(EnvPromote)
    if (args.from === args.to) this.fail('Choose two different environments.')
    const keys = this.chosenKeys((argv as string[]).slice(2), flags.all)

    const {config, projectId, projectName} = await this.resolveProject(flags)
    const environments = await this.listEnvironments(config, projectId)
    const find = (name: string) => {
      const found = environments.find((e) => e.name === name)
      if (!found) {
        this.fail(`Project "${projectName}" has no environment "${name}".`, `Environments: ${environments.map((e) => e.name).join(', ')}`)
      }

      return found
    }

    const from = find(args.from)
    const to = find(args.to)
    const source: Resolved = {config, environment: from, projectId, projectName}
    const target: Resolved = {config, environment: to, projectId, projectName}
    const src = await this.reveal(source, 'read')
    const tgt = await this.reveal(target, 'change')

    const plan = planPromotion(src.variables, tgt.variables, keys)
    if (plan.missing.length > 0) this.fail(`Not set in "${from.name}": ${plan.missing.join(', ')}`)
    const send = [...plan.added, ...plan.changed]
    if (send.length === 0) {
      this.log(
        `Nothing to promote: ${plan.same.length === 0 ? 'there are no variables to copy' : `the chosen variables already have the same values in "${to.name}"`}.`,
      )
      return
    }

    this.log(`Project: ${projectName} · ${from.name} -> ${to.name}${to.protected ? ' (protected)' : ''}`)
    for (const k of plan.added) this.log(`  + ${k} (new in ${to.name})`)
    for (const k of plan.changed) this.log(`  ~ ${k} (replaces the current value in ${to.name})`)
    if (plan.same.length > 0) this.log(`  = ${plan.same.length} already equal, skipped`)
    const ok = await this.confirmOrFail(`Write ${send.length} variable${send.length === 1 ? '' : 's'} into "${to.name}"?`, flags.yes)
    if (!ok) {
      this.log('Cancelled. Nothing was written.')
      return
    }

    try {
      await api(config, `/projects/${projectId}/environments/${to.id}/promote`, {
        body: {expectedUpdatedAt: tgt.updatedAt ?? to.updatedAt, from: from.id, keys: send},
        method: 'POST',
      })
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 400) this.fail(error.message)
        this.failFromApi(error, {environment: to.name, verb: 'change'})
      }

      throw error
    }

    this.log(`${to.name}: promoted ${send.length} variable${send.length === 1 ? '' : 's'} from ${from.name} (a version was recorded)`)
    if (to.usedBy.length > 0) {
      this.log(`Used by ${to.usedBy.map((u) => u.name).join(', ')}: they pick the change up on their next deploy.`)
    }
  }

  /** The variable names to promote (or 'all'); ends the command on a wrong combination. */
  private chosenKeys(names: string[], all: boolean): 'all' | string[] {
    if (all && names.length > 0) this.fail('Use either variable names or --all, not both.')
    if (all) return 'all'
    if (names.length === 0) {
      this.fail('Name the variables to promote, or pass --all.', 'Example: aoox env promote staging production API_URL')
    }

    try {
      return parseKeys(names)
    } catch (error) {
      if (error instanceof EnvInputError) this.fail(error.message)
      throw error
    }
  }
}
