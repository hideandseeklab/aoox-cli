import {select} from '@inquirer/prompts'
import {Command, Flags} from '@oclif/core'

import type {Application, Project} from '../lib/types.js'

import {api, ApiError} from '../lib/api.js'
import {MissingCredentialsError} from '../lib/config.js'
import {connectionFlags, loadCredentials} from '../lib/flags.js'
import {writeLink} from '../lib/link.js'
import {warnIfOutdated} from '../lib/outdated.js'

export default class Link extends Command {
  static description = 'Link this folder to an application in the panel (used by `aoox deploy`, `aoox run` without `--set`/`--env`, and the `aoox env` defaults and links)'
  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --project <id> --app <id>',
  ]
  static flags = {
    ...connectionFlags,
    app: Flags.string({description: 'Application ID; skip the interactive selection'}),
    project: Flags.string({description: 'Project ID; skip the interactive selection'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Link)

    let config
    try {
      config = await loadCredentials(this.config.configDir, flags)
    } catch (error) {
      if (error instanceof MissingCredentialsError) {
        this.error(error.message, {suggestions: ['Run `aoox login`.']})
      }

      throw error
    }

    const project = await this.pickProject(config, flags.project)
    const application = await this.pickApplication(config, project, flags.app)

    const path = await writeLink(process.cwd(), {
      applicationId: application.id,
      applicationName: application.name,
      projectId: project.id,
      projectName: project.name,
      url: config.url,
    })

    this.log(`Linked: ${project.name} / ${application.name} (${application.appName})`)
    this.log(`Written to ${path} — safe to commit, contains no secrets.`)
    await warnIfOutdated((m) => this.warn(m), this.config.version, config)
  }

  private async pickApplication(
    config: Awaited<ReturnType<typeof loadCredentials>>,
    project: Project,
    appId?: string,
  ): Promise<Application> {
    const apps = await api<Application[]>(config, `/applications?projectId=${project.id}`)
    if (appId) {
      const found = apps.find((a) => a.id === appId)
      if (!found) this.error(`Application ${appId} not found in project ${project.name}.`)
      return found
    }

    if (apps.length === 0) {
      this.error(`Project "${project.name}" has no applications yet.`, {
        suggestions: ['Create the application in the panel first, then run `aoox link` again.'],
      })
    }

    if (!process.stdin.isTTY) {
      this.error('No interactive terminal to pick an application from.', {
        suggestions: ['Pass --app <id>.'],
      })
    }

    return select({
      choices: apps.map((a) => ({
        description: `${a.sourceType} · ${a.status}`,
        name: `${a.name} (${a.appName})`,
        value: a,
      })),
      message: 'Select an application',
    })
  }

  private async pickProject(
    config: Awaited<ReturnType<typeof loadCredentials>>,
    projectId?: string,
  ): Promise<Project> {
    let projects: Project[]
    try {
      projects = await api<Project[]>(config, '/projects')
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        this.error('The token is no longer valid.', {suggestions: ['Run `aoox login`.']})
      }

      throw error
    }

    if (projectId) {
      const found = projects.find((p) => p.id === projectId)
      if (!found) this.error(`Project ${projectId} not found.`)
      return found
    }

    if (projects.length === 0) {
      this.error('No projects in this panel yet.', {suggestions: ['Create a project in the panel first.']})
    }

    if (!process.stdin.isTTY) {
      this.error('No interactive terminal to pick a project from.', {
        suggestions: ['Pass --project <id>.'],
      })
    }

    return select({
      choices: projects.map((p) => ({name: p.name, value: p})),
      message: 'Select a project',
    })
  }
}
