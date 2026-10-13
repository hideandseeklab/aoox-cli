import {confirm} from '@inquirer/prompts'
import {Command, Flags} from '@oclif/core'

import type {CliConfig} from './config.js'
import type {
  EnvironmentView,
  LinkOwnerDetail,
  LinkView,
  RevealView,
  VariableSetDetail,
  VariableSetSummary,
} from './types.js'

import {api, ApiError} from './api.js'
import {MissingCredentialsError} from './config.js'
import {connectionFlags, loadCredentials} from './flags.js'
import {type LinkFile, readLink} from './link.js'
import {warnIfOutdated} from './outdated.js'
import {pickEnvironment, pickSet, SelectionError} from './variable-sets.js'

/** `--app` / `--stack`: which application or compose stack; default = the one linked with `aoox link`. */
export const ownerFlags = {
  app: Flags.string({description: 'Application ID; defaults to the application linked with `aoox link`'}),
  stack: Flags.string({
    description: 'Compose stack ID, instead of an application',
    exclusive: ['app'],
  }),
}

/** `--set` and `--env`: one environment of a variable set. */
export const selectorFlags = {
  env: Flags.string({
    char: 'e',
    description:
      'Environment of the set (e.g. development, staging, production). Default: the only environment of the set the linked application links',
  }),
  set: Flags.string({
    char: 's',
    description:
      'Variable set slug (or name). Default: the only set the linked application links, or the only set you can see',
  }),
}

/** Flags of every `aoox env …` command that works on one set environment. */
export const environmentCommandFlags = {...connectionFlags, ...ownerFlags, ...selectorFlags}

/** Why the panel refused, in the CLI's words. */
export function friendlyForbidden(message: string, environment: string, verb: 'change' | 'read'): string {
  // The API names protection explicitly; everything else (viewer role, a token
  // limited to other environments) already says what it needs to.
  return /protected/i.test(message)
    ? `"${environment}" is protected; only instance owners and admins can ${verb} it.`
    : message
}

export interface Owner {
  detail: LinkOwnerDetail
  id: string
  kind: 'application' | 'compose'
  /** For messages: `Application "web"` or `Stack "blog"`. */
  label: string
}

export interface Resolved {
  config: CliConfig
  environment: EnvironmentView
  /** `<set-slug>/<env>`, the way token scopes and messages name it. */
  label: string
  set: VariableSetDetail
}

type OwnerFlagValues = {app?: string; stack?: string}
type ConnectionFlagValues = {token?: string; url?: string}

/** Shared plumbing of `aoox env …` and `aoox run`: credentials, owner, set, environment, error style. */
export abstract class EnvCommand extends Command {
  /**
   * Asks `message` (default no) unless `yes`. Without a terminal there is
   * nobody to ask, so it refuses instead of guessing.
   */
  protected async confirmOrFail(message: string, yes: boolean): Promise<boolean> {
    if (yes) return true
    if (!process.stdin.isTTY) {
      this.fail('This needs a confirmation and there is no terminal to ask.', 'Pass --yes to confirm.')
    }

    return confirm({default: false, message})
  }

  /** Credentials (the link's panel is the default) and the link file, if any. */
  protected async connect(flags: ConnectionFlagValues): Promise<{config: CliConfig; link: LinkFile | null}> {
    let link: LinkFile | null
    try {
      link = await readLink(process.cwd())
    } catch (error) {
      this.fail((error as Error).message)
    }

    const config = await this.loadConfig(flags, link?.url)
    return {config, link}
  }

  /** Prints `❌ first line` plus plain hint lines to stderr and exits 1. */
  protected fail(...lines: string[]): never {
    for (const [i, line] of lines.entries()) {
      this.logToStderr(i === 0 ? `❌ ${line}` : line)
    }

    this.exit(1)
  }

  /** Maps an API failure onto the CLI's error style; always ends the command. */
  protected failFromApi(error: unknown, ctx: {environment?: string; verb?: 'change' | 'read'} = {}): never {
    if (!(error instanceof ApiError)) throw error
    switch (error.status) {
      case 0: {
        this.fail(error.message)
        break
      }

      case 401: {
        this.fail('The token is no longer valid.', 'Run `aoox login` to save a new token.')
        break
      }

      case 403: {
        this.fail(friendlyForbidden(error.message, ctx.environment ?? 'This environment', ctx.verb ?? 'read'))
        break
      }

      case 409: {
        if (/changed by someone else|someone else/i.test(error.message) || ctx.verb === 'change') {
          this.fail(
            'The environment was changed by someone else while you were editing it. Nothing was written.',
            'Run the command again to apply your change on top of the latest version.',
          )
        }

        this.fail(error.message)
        break
      }

      default: {
        this.fail(error.message)
      }
    }
  }

  protected async loadConfig(flags: ConnectionFlagValues, defaultUrl?: string): Promise<CliConfig> {
    try {
      const config = await loadCredentials(this.config.configDir, flags, defaultUrl)
      await warnIfOutdated((m) => this.warn(m), this.config.version, config)
      return config
    } catch (error) {
      if (error instanceof MissingCredentialsError) this.fail(error.message, 'Run `aoox login`.')
      throw error
    }
  }

  /**
   * One environment of one set, from `--set`/`--env` or the defaults the
   * linked application's links give (see `pickSet` / `pickEnvironment`).
   */
  protected async resolveEnvironment(flags: ConnectionFlagValues & OwnerFlagValues & {env?: string; set?: string}): Promise<Resolved> {
    const {config, links, set} = await this.resolveSet(flags, !flags.env)
    let environment: EnvironmentView
    try {
      environment = pickEnvironment(set, flags.env, links)
    } catch (error) {
      if (error instanceof SelectionError) this.fail(error.message, ...error.hints)
      throw error
    }

    return {config, environment, label: `${set.slug}/${environment.name}`, set}
  }

  /**
   * The application (`--app` or the link) or compose stack (`--stack`) with
   * its ordered links and own env. Without any of them: undefined, or an
   * error when `required`.
   */
  protected async resolveOwner(
    config: CliConfig,
    link: LinkFile | null,
    flags: OwnerFlagValues,
    required: boolean,
  ): Promise<Owner | undefined> {
    const kind = flags.stack ? 'compose' : 'application'
    const id = flags.stack ?? flags.app ?? link?.applicationId
    if (!id) {
      if (!required) return undefined
      this.fail('No application to use.', 'Run `aoox link` in this folder, or pass --app <id> (or --stack <id> for a compose stack).')
    }

    try {
      const path = kind === 'compose' ? `/compose-apps/${encodeURIComponent(id)}` : `/applications/${encodeURIComponent(id)}`
      const detail = await api<LinkOwnerDetail>(config, path)
      return {
        detail: {...detail, variableSets: detail.variableSets ?? []},
        id: detail.id,
        kind,
        label: `${kind === 'compose' ? 'Stack' : 'Application'} "${detail.name}"`,
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        if (!flags.app && !flags.stack && link) {
          this.fail(
            `The linked application "${link.applicationName}" no longer exists in this panel.`,
            'Run `aoox link` again, or pass --app <id> / --set <slug>.',
          )
        }

        this.fail(`${kind === 'compose' ? 'Stack' : 'Application'} ${id} not found.`)
      }

      return this.failFromApi(error)
    }
  }

  /** The set from `--set`, else the linked owner's only set, else the only visible set. */
  protected async resolveSet(
    flags: ConnectionFlagValues & OwnerFlagValues & {set?: string},
    needLinksForEnv = false,
  ): Promise<{config: CliConfig; links?: LinkView[]; set: VariableSetDetail}> {
    const {config, link} = await this.connect(flags)
    // The links only matter for a default; skip the request when both are given.
    const needLinks = !flags.set || needLinksForEnv
    const owner = needLinks ? await this.resolveOwner(config, link, flags, Boolean(flags.app || flags.stack)) : undefined
    const links = owner?.detail.variableSets
    const sets = await this.listSets(config)
    let picked: VariableSetSummary
    try {
      picked = pickSet(sets, flags.set, links)
    } catch (error) {
      if (error instanceof SelectionError) this.fail(error.message, ...error.hints)
      throw error
    }

    try {
      const set = await api<VariableSetDetail>(config, `/variable-sets/${picked.id}`)
      return {config, links, set}
    } catch (error) {
      return this.failFromApi(error)
    }
  }

  /** Reads the values through the audited reveal endpoint (`verb` only words a refusal: set/unset read to change). */
  protected async reveal(r: Resolved, verb: 'change' | 'read' = 'read'): Promise<RevealView> {
    return this.revealById(r.config, {environmentId: r.environment.id, label: r.label, setId: r.set.id}, verb)
  }

  /** The audited reveal by ids; `label` (`<slug>/<env>`) only words a refusal. */
  protected async revealById(
    config: CliConfig,
    {environmentId, label, setId}: {environmentId: string; label: string; setId: string},
    verb: 'change' | 'read' = 'read',
  ): Promise<RevealView> {
    try {
      return await api<RevealView>(config, `/variable-sets/${setId}/environments/${environmentId}/reveal`, {method: 'POST'})
    } catch (error) {
      return this.failFromApi(error, {environment: label, verb})
    }
  }

  /** `PUT …/environments/:envId`; a 400 (bad text) and a 409 (changed meanwhile) end the command clearly. */
  protected async saveEnvironment(
    r: Resolved,
    body: {
      action: 'push' | 'set' | 'unset'
      expectedUpdatedAt: string
      flags?: Record<string, boolean | null>
      variables: string
    },
  ): Promise<EnvironmentView> {
    try {
      return await api<EnvironmentView>(r.config, `/variable-sets/${r.set.id}/environments/${r.environment.id}`, {
        body,
        method: 'PUT',
      })
    } catch (error) {
      if (error instanceof ApiError && error.status === 400) this.fail(error.message)
      return this.failFromApi(error, {environment: r.label, verb: 'change'})
    }
  }

  /** "Used by …" after a change: linked apps and stacks pick it up on their next deploy. */
  protected usedByNote(view: EnvironmentView): void {
    if (view.usedBy.length === 0) return
    const names = view.usedBy.map((u) => `${u.name} (${u.projectName})`).join(', ')
    this.log(`Used by ${names}: they pick the change up on their next deploy.`)
  }

  private async listSets(config: CliConfig): Promise<VariableSetSummary[]> {
    try {
      return await api<VariableSetSummary[]>(config, '/variable-sets')
    } catch (error) {
      return this.failFromApi(error)
    }
  }
}
