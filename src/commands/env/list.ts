import {Flags} from '@oclif/core'

import {EnvCommand, projectFlags} from '../../lib/env-command.js'
import {hasReferences, parseEnvLines, REFERENCE_NOTE} from '../../lib/env-text.js'

export interface EnvListEnvironment {
  keys: string[]
  name: string
  protected: boolean
  usedBy: string[]
  variables: number
}

export interface EnvListVariables {
  environment: string
  protected: boolean
  /** Variables flagged secret. */
  secretKeys: string[]
  /** Present only with `--reveal`. */
  values?: Record<string, string>
  variables: string[]
}

/** Shown after a secret variable in the list. */
const SECRET_MARK = '  [secret]'

export default class EnvList extends EnvCommand {
  static description =
    'List the project environments, or (with --env) the variable names of one. Values are masked unless --reveal is given'
  static enableJsonFlag = true
  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --env staging',
    '<%= config.bin %> <%= command.id %> --env development --reveal',
  ]
  static flags = {
    ...projectFlags,
    env: Flags.string({
      char: 'e',
      description: 'Environment name; without it the environments of the project are listed',
    }),
    reveal: Flags.boolean({description: 'Show the values (needs --env; the read is recorded in the audit log)'}),
  }

  async run(): Promise<EnvListEnvironment[] | EnvListVariables> {
    const {flags} = await this.parse(EnvList)
    if (flags.reveal && !flags.env) {
      this.fail('--reveal needs --env <name>.', 'Example: aoox env list --env development --reveal')
    }

    if (flags.env) return this.listVariables({...flags, env: flags.env}, flags.reveal)

    const {config, projectId, projectName} = await this.resolveProject(flags)
    const environments = await this.listEnvironments(config, projectId)
    this.log(`Project: ${projectName}`)
    const rows = environments.map((e) => ({
      name: e.protected ? `${e.name} (protected)` : e.name,
      usedBy: e.usedBy.length === 0 ? '-' : e.usedBy.map((u) => u.name).join(', '),
      variables: String(e.keys.length),
    }))
    const w = {
      name: Math.max(4, ...rows.map((r) => r.name.length)),
      variables: Math.max(9, ...rows.map((r) => r.variables.length)),
    }
    this.log(`${'NAME'.padEnd(w.name)}  ${'VARIABLES'.padEnd(w.variables)}  USED BY`)
    for (const r of rows) this.log(`${r.name.padEnd(w.name)}  ${r.variables.padEnd(w.variables)}  ${r.usedBy}`)

    return environments.map((e) => ({
      keys: e.keys,
      name: e.name,
      protected: e.protected,
      usedBy: e.usedBy.map((u) => u.name),
      variables: e.keys.length,
    }))
  }

  private async listVariables(
    flags: {env: string; project?: string; token?: string; url?: string},
    reveal: boolean,
  ): Promise<EnvListVariables> {
    const resolved = await this.resolveEnvironment(flags)
    const {environment} = resolved
    this.log(`Project: ${resolved.projectName} · environment: ${environment.name}${environment.protected ? ' (protected)' : ''}`)

    if (!reveal) {
      // Names come from the list endpoint, which never carries values.
      const secret = new Set(environment.secretKeys ?? [])
      if (environment.keys.length === 0) this.log('No variables.')
      for (const k of environment.keys) this.log(`${k}=••••••••${secret.has(k) ? SECRET_MARK : ''}`)
      return {
        environment: environment.name,
        protected: environment.protected,
        secretKeys: [...secret],
        variables: environment.keys,
      }
    }

    const revealed = await this.reveal(resolved)
    const pairs = parseEnvLines(revealed.variables)
    if (pairs.length === 0) this.log('No variables.')
    const values: Record<string, string> = {}
    const secret = new Set(revealed.secretKeys ?? environment.secretKeys ?? [])
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
      values,
      variables: Object.keys(values),
    }
  }
}
