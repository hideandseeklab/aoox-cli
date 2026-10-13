import {Flags} from '@oclif/core'

import type {EnvironmentView} from '../../lib/types.js'

import {api, ApiError} from '../../lib/api.js'
import {EnvCommand, ownerFlags, type Resolved, selectorFlags} from '../../lib/env-command.js'
import {planPromotion} from '../../lib/env-plan.js'
import {EnvInputError, parseKeys} from '../../lib/env-text.js'
import {connectionFlags} from '../../lib/flags.js'

export default class EnvPromote extends EnvCommand {
  static description =
    'Copy variables (and their secret flag) from one environment of a variable set to another (name them, or use --all). Needs the right to read the source and to change the target. The target keeps its comments and order; new variables are appended. Shows what changes and asks before writing (unless --yes)'
  static examples = [
    '<%= config.bin %> <%= command.id %> --set shared --from staging --to production API_URL FEATURE_X',
    '<%= config.bin %> <%= command.id %> --from development --to staging --all --yes',
  ]
  static flags = {
    ...connectionFlags,
    ...ownerFlags,
    all: Flags.boolean({description: 'Promote every variable of the source (those already equal are skipped)'}),
    from: Flags.string({description: 'Environment to copy the values from', required: true}),
    set: selectorFlags.set,
    to: Flags.string({description: 'Environment to copy the values into', required: true}),
    yes: Flags.boolean({char: 'y', description: 'Do not ask for confirmation'}),
  }
  static strict = false

  async run(): Promise<void> {
    const {argv, flags} = await this.parse(EnvPromote)
    if (flags.from === flags.to) this.fail('Choose two different environments.')
    const keys = this.chosenKeys(argv as string[], flags.all)

    const {config, set} = await this.resolveSet(flags)
    const find = (name: string): EnvironmentView => {
      const found = set.environments.find((e) => e.name === name)
      if (!found) {
        this.fail(`Set "${set.slug}" has no environment "${name}".`, `Environments: ${set.environments.map((e) => e.name).join(', ')}`)
      }

      return found
    }

    const from = find(flags.from)
    const to = find(flags.to)
    const source: Resolved = {config, environment: from, label: `${set.slug}/${from.name}`, set}
    const target: Resolved = {config, environment: to, label: `${set.slug}/${to.name}`, set}
    const src = await this.reveal(source, 'read')
    const tgt = await this.reveal(target, 'change')

    const plan = planPromotion(src.variables, tgt.variables, keys)
    if (plan.missing.length > 0) this.fail(`Not set in "${source.label}": ${plan.missing.join(', ')}`)
    const send = [...plan.added, ...plan.changed]
    if (send.length === 0) {
      this.log(
        `Nothing to promote: ${plan.same.length === 0 ? 'there are no variables to copy' : `the chosen variables already have the same values in "${target.label}"`}.`,
      )
      return
    }

    this.log(`Set: ${set.slug} · ${from.name} -> ${to.name}${to.protected ? ' (protected)' : ''}`)
    for (const k of plan.added) this.log(`  + ${k} (new in ${to.name})`)
    for (const k of plan.changed) this.log(`  ~ ${k} (replaces the current value in ${to.name})`)
    if (plan.same.length > 0) this.log(`  = ${plan.same.length} already equal, skipped`)
    const ok = await this.confirmOrFail(`Write ${send.length} variable${send.length === 1 ? '' : 's'} into "${target.label}"?`, flags.yes)
    if (!ok) {
      this.log('Cancelled. Nothing was written.')
      return
    }

    let saved: {environment: EnvironmentView}
    try {
      saved = await api<{environment: EnvironmentView}>(config, `/variable-sets/${set.id}/environments/${to.id}/promote`, {
        body: {expectedUpdatedAt: tgt.updatedAt, from: from.id, keys: send},
        method: 'POST',
      })
    } catch (error) {
      if (error instanceof ApiError && error.status === 400) this.fail(error.message)
      return this.failFromApi(error, {environment: target.label, verb: 'change'})
    }

    this.log(`${target.label}: promoted ${send.length} variable${send.length === 1 ? '' : 's'} from ${from.name} (a version was recorded)`)
    this.usedByNote(saved.environment)
  }

  /** The variable names to promote (or 'all'); ends the command on a wrong combination. */
  private chosenKeys(names: string[], all: boolean): 'all' | string[] {
    if (all && names.length > 0) this.fail('Use either variable names or --all, not both.')
    if (all) return 'all'
    if (names.length === 0) {
      this.fail('Name the variables to promote, or pass --all.', 'Example: aoox env promote --from staging --to production API_URL')
    }

    try {
      return parseKeys(names)
    } catch (error) {
      if (error instanceof EnvInputError) this.fail(error.message)
      throw error
    }
  }
}
