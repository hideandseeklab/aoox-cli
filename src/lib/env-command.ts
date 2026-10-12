import {confirm} from '@inquirer/prompts'
import {Command, Flags} from '@oclif/core'

import type {CliConfig} from './config.js'
import type {ApplicationDetail, EnvironmentReveal, Project, ProjectEnvironment} from './types.js'

import {api, ApiError} from './api.js'
import {MissingCredentialsError} from './config.js'
import {connectionFlags, loadCredentials} from './flags.js'
import {readLink} from './link.js'
import {warnIfOutdated} from './outdated.js'

export const DEFAULT_ENVIRONMENT = 'development'

/** Flags shared by every `aoox env …` command and `aoox run`. */
export const projectFlags = {
  ...connectionFlags,
  project: Flags.string({
    description: 'Project ID or name; defaults to the project of the application linked with `aoox link`',
  }),
}

export const environmentFlag = {
  env: Flags.string({
    char: 'e',
    default: DEFAULT_ENVIRONMENT,
    description: 'Environment name (development, staging, production, or a custom one)',
  }),
}

/** Why the panel refused, in the CLI's words. */
export function friendlyForbidden(message: string, environment: string, verb: 'change' | 'read'): string {
  // The API names protection explicitly; everything else (viewer role, a token
  // limited to other environments) already says what it needs to.
  return /protected/i.test(message) ? `"${environment}" is protected; only project admins can ${verb} it.` : message
}

export interface Resolved {
  config: CliConfig
  environment: ProjectEnvironment
  projectId: string
  projectName: string
}

/** Shared plumbing of `aoox env …` and `aoox run`: credentials, project, environment, error style. */
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
        this.fail(
          'The environment was changed by someone else while you were editing it. Nothing was written.',
          'Run the command again to apply your change on top of the latest version.',
        )
        break
      }

      default: {
        this.fail(error.message)
      }
    }
  }

  protected async listEnvironments(config: CliConfig, projectId: string): Promise<ProjectEnvironment[]> {
    try {
      return await api<ProjectEnvironment[]>(config, `/projects/${projectId}/environments`)
    } catch (error) {
      return this.failFromApi(error)
    }
  }

  protected async loadConfig(
    flags: {project?: string; token?: string; url?: string},
    defaultUrl?: string,
  ): Promise<CliConfig> {
    try {
      const config = await loadCredentials(this.config.configDir, flags, defaultUrl)
      await warnIfOutdated((m) => this.warn(m), this.config.version, config)
      return config
    } catch (error) {
      if (error instanceof MissingCredentialsError) this.fail(error.message, 'Run `aoox login`.')
      throw error
    }
  }

  /** Project plus one environment by name. */
  protected async resolveEnvironment(
    flags: {env: string; project?: string; token?: string; url?: string},
    cwd = process.cwd(),
  ): Promise<Resolved> {
    const {config, projectId, projectName} = await this.resolveProject(flags, cwd)
    const environments = await this.listEnvironments(config, projectId)
    const environment = environments.find((e) => e.name === flags.env)
    if (!environment) {
      this.fail(
        `Project "${projectName}" has no environment "${flags.env}".`,
        `Environments: ${environments.map((e) => e.name).join(', ')}`,
      )
    }

    return {config, environment, projectId, projectName}
  }

  /** The project from `--project` (id or name), else from the linked application. */
  protected async resolveProject(
    flags: {project?: string; token?: string; url?: string},
    cwd = process.cwd(),
  ): Promise<{config: CliConfig; projectId: string; projectName: string}> {
    let link
    try {
      link = await readLink(cwd)
    } catch (error) {
      this.fail((error as Error).message)
    }

    if (!flags.project && !link) {
      this.fail('No project to use.', 'Run `aoox link` in this folder, or pass --project <id|name>.')
    }

    const config = await this.loadConfig(flags, flags.project ? undefined : link?.url)

    try {
      if (flags.project) {
        const projects = await api<Project[]>(config, '/projects')
        const wanted = flags.project.trim()
        const byId = projects.find((p) => p.id === wanted)
        const named = projects.filter((p) => p.name.toLowerCase() === wanted.toLowerCase())
        if (byId) return {config, projectId: byId.id, projectName: byId.name}
        if (named.length === 1) return {config, projectId: named[0].id, projectName: named[0].name}
        if (named.length > 1) {
          this.fail(`Several projects are named "${wanted}".`, 'Pass the project ID instead (aoox link shows it).')
        }

        this.fail(`Project "${wanted}" not found.`, `Projects you can use: ${projects.map((p) => p.name).join(', ') || 'none'}`)
      }

      // The link names an application; ask the panel which project it belongs to now.
      const app = await api<ApplicationDetail>(config, `/applications/${link!.applicationId}`)
      return {config, projectId: app.projectId, projectName: app.project?.name ?? link!.projectName}
    } catch (error) {
      if (error instanceof ApiError && error.status === 404 && !flags.project) {
        this.fail(
          `The linked application "${link!.applicationName}" no longer exists in this panel.`,
          'Run `aoox link` again, or pass --project <id|name>.',
        )
      }

      return this.failFromApi(error)
    }
  }

  /** Reads the values through the audited reveal endpoint (`verb` only words a refusal: set/unset read to change). */
  protected async reveal(r: Resolved, verb: 'change' | 'read' = 'read'): Promise<EnvironmentReveal> {
    try {
      return await api<EnvironmentReveal>(r.config, `/projects/${r.projectId}/environments/${r.environment.id}/reveal`, {
        method: 'POST',
      })
    } catch (error) {
      return this.failFromApi(error, {environment: r.environment.name, verb})
    }
  }
}
