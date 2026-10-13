import {Flags} from '@oclif/core'

import type {VariableSetSummary} from '../../lib/types.js'

import {api} from '../../lib/api.js'
import {EnvCommand, ownerFlags, selectorFlags} from '../../lib/env-command.js'
import {hasReferences, parseEnvLines, REFERENCE_NOTE} from '../../lib/env-text.js'
import {connectionFlags} from '../../lib/flags.js'
import {findSet} from '../../lib/variable-sets.js'

export interface EnvListSet {
  environments: Array<{name: string; protected: boolean; usedBy: number; variables: number}>
  name: string
  role: string
  sharedWithAll: boolean
  slug: string
}

export interface EnvListVariables {
  environment: string
  protected: boolean
  /** Variables flagged secret. */
  secretKeys: string[]
  set: string
  /** Present only with `--reveal`. */
  values?: Record<string, string>
  variables: string[]
}

/** Shown after a secret variable in the list. */
const SECRET_MARK = '  [secret]'

export default class EnvList extends EnvCommand {
  static aliases = ['env:sets']
  static description =
    'List the variable sets you can see and their environments (with --set: one set; with --env: the variable names of one environment). Values are masked unless --reveal is given'
  static enableJsonFlag = true
  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --set shared',
    '<%= config.bin %> <%= command.id %> --set shared --env staging',
    '<%= config.bin %> <%= command.id %> --set shared --env development --reveal',
  ]
  static flags = {
    ...connectionFlags,
    ...ownerFlags,
    env: Flags.string({
      char: 'e',
      description: 'Environment name; lists its variable names (the set defaults like in the other env commands)',
    }),
    reveal: Flags.boolean({description: 'Show the values (needs --env; the read is recorded in the audit log)'}),
    set: Flags.string({char: 's', description: selectorFlags.set.description}),
  }

  async run(): Promise<EnvListSet[] | EnvListVariables> {
    const {flags} = await this.parse(EnvList)
    if (flags.reveal && !flags.env) {
      this.fail('--reveal needs --env <name>.', 'Example: aoox env list --set shared --env development --reveal')
    }

    if (flags.env) return this.listVariables(flags, flags.reveal)

    let sets: VariableSetSummary[]
    const {config} = await this.connect(flags)
    try {
      sets = await api<VariableSetSummary[]>(config, '/variable-sets')
    } catch (error) {
      return this.failFromApi(error)
    }

    if (flags.set) {
      const found = findSet(sets, flags.set)
      if (!found) this.fail(`Variable set "${flags.set}" not found.`, `Sets you can see: ${sets.map((s) => s.slug).join(', ') || 'none'}`)
      sets = [found]
    }

    if (sets.length === 0) {
      this.log('No variable set is shared with you. An instance owner or admin creates sets in the dashboard (Variables).')
      return []
    }

    for (const [i, s] of sets.entries()) {
      if (i > 0) this.log('')
      const shared = s.sharedWithAll ? 'all projects' : s.projects.map((p) => p.name).join(', ') || 'no project'
      this.log(`${s.slug}  (${s.name}) · shared with ${shared} · your role: ${s.role}`)
      const w = Math.max(4, ...s.environments.map((e) => e.name.length + (e.protected ? 12 : 0)))
      for (const e of s.environments) {
        const name = e.protected ? `${e.name} (protected)` : e.name
        const used = e.usedByCount > 0 ? `  used by ${e.usedByCount}` : ''
        this.log(`  ${name.padEnd(w)}  ${e.keyCount} variable${e.keyCount === 1 ? '' : 's'}${used}`)
      }
    }

    return sets.map((s) => ({
      environments: s.environments.map((e) => ({
        name: e.name,
        protected: e.protected,
        usedBy: e.usedByCount,
        variables: e.keyCount,
      })),
      name: s.name,
      role: s.role,
      sharedWithAll: s.sharedWithAll,
      slug: s.slug,
    }))
  }

  private async listVariables(
    flags: {app?: string; env?: string; set?: string; stack?: string; token?: string; url?: string},
    reveal: boolean,
  ): Promise<EnvListVariables> {
    const resolved = await this.resolveEnvironment(flags)
    const {environment} = resolved
    this.log(`Environment: ${resolved.label}${environment.protected ? ' (protected)' : ''}`)

    if (!reveal) {
      // Names come from the set detail, which never carries values.
      const secret = new Set(environment.secretKeys)
      if (environment.keys.length === 0) this.log('No variables.')
      for (const k of environment.keys) this.log(`${k}=••••••••${secret.has(k) ? SECRET_MARK : ''}`)
      return {
        environment: environment.name,
        protected: environment.protected,
        secretKeys: [...secret],
        set: resolved.set.slug,
        variables: environment.keys,
      }
    }

    const revealed = await this.reveal(resolved)
    const pairs = parseEnvLines(revealed.variables)
    if (pairs.length === 0) this.log('No variables.')
    const values: Record<string, string> = {}
    const secret = new Set(revealed.secretKeys)
    for (const [k, v] of pairs) {
      this.log(`${k}=${v}${secret.has(k) ? SECRET_MARK : ''}`)
      values[k] = v
    }

    if (hasReferences(revealed.variables)) {
      this.logToStderr(`Note: ${REFERENCE_NOTE}`)
    }

    return {
      environment: environment.name,
      protected: environment.protected,
      secretKeys: [...secret],
      set: resolved.set.slug,
      values,
      variables: Object.keys(values),
    }
  }
}
