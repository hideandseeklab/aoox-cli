import {select} from '@inquirer/prompts'
import {Command, Flags} from '@oclif/core'

import type {ApplicationDetail, Deployment, Registry, RegistryCredentials} from '../lib/types.js'

import {api, ApiError} from '../lib/api.js'
import {MissingCredentialsError} from '../lib/config.js'
import {dockerEngineStatus, dockerInherit, dockerLogin, dockerUnavailableLines} from '../lib/docker.js'
import {connectionFlags, loadCredentials} from '../lib/flags.js'
import {deployTag} from '../lib/git.js'
import {imageRefFor} from '../lib/image-ref.js'
import {readLink} from '../lib/link.js'
import {warnIfOutdated} from '../lib/outdated.js'
import {chooseRegistry, localhostRegistryHint} from '../lib/registry-select.js'
import {stepLine, successLine, warnLine} from '../lib/style.js'

type Config = Awaited<ReturnType<typeof loadCredentials>>

/** How often to poll GET /deployments/:id while a deploy is in progress. */
const POLL_MS = 1500

export default class Deploy extends Command {
  static description = 'Build a local image, push it to the aoox registry, then deploy (the repo must be linked with `aoox link` first)'
  static examples = ['<%= config.bin %> <%= command.id %>', '<%= config.bin %> <%= command.id %> --tag v1.2.3']
  static flags = {
    ...connectionFlags,
    context: Flags.string({default: '.', description: 'Docker build context'}),
    dockerfile: Flags.string({char: 'f', default: 'Dockerfile', description: 'Path to the Dockerfile'}),
    registry: Flags.string({description: 'Registry ID to push to; defaults to the self-hosted registry'}),
    tag: Flags.string({description: 'Image tag; defaults to the git short SHA (+ -dirty)'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Deploy)
    const cwd = process.cwd()

    const link = await readLink(cwd)
    if (!link) {
      this.error('This repo is not linked yet.', {suggestions: ['Run `aoox link` first.']})
    }

    let config: Config
    try {
      config = await loadCredentials(this.config.configDir, flags, link.url)
    } catch (error) {
      if (error instanceof MissingCredentialsError) {
        this.error(error.message, {suggestions: ['Run `aoox login`.']})
      }

      throw error
    }

    await warnIfOutdated((m) => this.logToStderr(warnLine(m)), this.config.version, config)

    const app = await this.getApplication(config, link.applicationId)
    const registry = await this.pickRegistry(config, flags.registry)
    const credentials = await api<RegistryCredentials>(config, `/registries/${registry.id}/credentials`)
    const localHint = localhostRegistryHint(registry.url, config.url)
    if (localHint) this.logToStderr(warnLine(localHint))

    const tag = flags.tag ?? deployTag(cwd)
    const imageRef = imageRefFor({appName: app.appName, projectName: app.project.name, registryUrl: registry.url, tag})

    const engine = await dockerEngineStatus()
    if (engine !== 'ok') {
      const [headline, hint] = dockerUnavailableLines(engine)
      this.error(headline, {suggestions: [hint]})
    }

    this.log(stepLine('Build', imageRef))
    await dockerInherit(['build', '-t', imageRef, '-f', flags.dockerfile, flags.context], cwd)

    if (credentials.username && credentials.password) {
      this.log(stepLine('docker login', registry.url))
      await dockerLogin(registry.url, credentials.username, credentials.password, cwd)
    }

    this.log(stepLine('Push', imageRef))
    await dockerInherit(['push', imageRef], cwd)

    this.log(stepLine('Updating the application & triggering a deploy'))
    await api(config, `/applications/${app.id}`, {
      body: {imageRef, imageRegistryId: registry.id, sourceType: 'image'},
      method: 'PATCH',
    })
    const deployment = await this.queueDeploy(config, app.id)
    await this.follow(config, deployment.id)
  }

  /**
   * Prints new log output as it appears and stops when the deployment
   * finishes. Recursive rather than a `for(;;)` loop so the sequential
   * `await`s (deliberate — each poll must wait for the previous one) don't
   * trip `no-await-in-loop`, which is meant for the accidentally-serial case.
   */
  private async follow(config: Config, deploymentId: string, printed = 0): Promise<void> {
    const dep = await api<Deployment>(config, `/deployments/${deploymentId}`)
    if (dep.logs.length > printed) {
      this.log(dep.logs.slice(printed).replace(/\n$/, ''))
      printed = dep.logs.length
    }

    if (dep.status === 'success') {
      this.log(successLine('Deployed:', dep.imageRef ?? undefined))
      return
    }

    if (dep.status === 'failed') {
      this.error(dep.errorMessage ?? 'Deployment failed.')
    }

    await new Promise((resolve) => {
      setTimeout(resolve, POLL_MS)
    })
    return this.follow(config, deploymentId, printed)
  }

  private async getApplication(config: Config, id: string): Promise<ApplicationDetail> {
    try {
      return await api<ApplicationDetail>(config, `/applications/${id}`)
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        this.error('The token is no longer valid.', {suggestions: ['Run `aoox login`.']})
      }

      if (error instanceof ApiError && error.status === 404) {
        this.error('The linked application no longer exists.', {suggestions: ['Run `aoox link` again.']})
      }

      throw error
    }
  }

  private async pickRegistry(config: Config, registryId?: string): Promise<Registry> {
    const registries = await api<Registry[]>(config, '/registries')
    const choice = chooseRegistry(registries, registryId)
    if (choice.kind === 'found') return choice.registry
    if (choice.kind === 'error') this.error(choice.message, {suggestions: choice.suggestions})

    if (!process.stdin.isTTY) {
      this.error('There are several registries and none is self-hosted; cannot pick one automatically.', {
        suggestions: ['Pass --registry <id>.'],
      })
    }

    return select({
      choices: choice.registries.map((r) => ({name: `${r.name} (${r.url})`, value: r})),
      message: 'Select a registry',
    })
  }

  /** `POST /:id/deploy` returns 409 while another deployment is already running. */
  private async queueDeploy(config: Config, applicationId: string): Promise<Deployment> {
    try {
      return await api<Deployment>(config, `/applications/${applicationId}/deploy`, {method: 'POST'})
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        this.error('A deployment is already running for this application.', {
          suggestions: ['Wait for that deployment to finish, then try again.'],
        })
      }

      throw error
    }
  }
}
