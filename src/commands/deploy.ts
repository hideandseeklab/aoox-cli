import {select} from '@inquirer/prompts'
import {Command, Flags} from '@oclif/core'

import type {ApplicationDetail, Deployment, Registry, RegistryCredentials} from '../lib/types.js'

import {api, ApiError} from '../lib/api.js'
import {MissingCredentialsError} from '../lib/config.js'
import {dockerInherit, dockerLogin} from '../lib/docker.js'
import {connectionFlags, loadCredentials} from '../lib/flags.js'
import {deployTag} from '../lib/git.js'
import {imageRefFor} from '../lib/image-ref.js'
import {readLink} from '../lib/link.js'

type Config = Awaited<ReturnType<typeof loadCredentials>>

/** How often to poll GET /deployments/:id while a deploy is in progress. */
const POLL_MS = 1500

export default class Deploy extends Command {
  static description = 'Build image lokal, push ke registry aoox, lalu deploy (repo harus di-`aoox link` dulu)'
  static examples = ['<%= config.bin %> <%= command.id %>', '<%= config.bin %> <%= command.id %> --tag v1.2.3']
  static flags = {
    ...connectionFlags,
    context: Flags.string({default: '.', description: 'Docker build context'}),
    dockerfile: Flags.string({char: 'f', default: 'Dockerfile', description: 'Path ke Dockerfile'}),
    registry: Flags.string({description: 'ID registry tujuan push; default registry self-hosted'}),
    tag: Flags.string({description: 'Tag image; default git short SHA (+ -dirty)'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Deploy)
    const cwd = process.cwd()

    const link = await readLink(cwd)
    if (!link) {
      this.error('Repo ini belum di-link.', {suggestions: ['Jalankan `aoox link` dulu.']})
    }

    let config: Config
    try {
      config = await loadCredentials(this.config.configDir, flags, link.url)
    } catch (error) {
      if (error instanceof MissingCredentialsError) {
        this.error(error.message, {suggestions: ['Jalankan `aoox login`.']})
      }

      throw error
    }

    const app = await this.getApplication(config, link.applicationId)
    const registry = await this.pickRegistry(config, flags.registry)
    const credentials = await api<RegistryCredentials>(config, `/registries/${registry.id}/credentials`)

    const tag = flags.tag ?? deployTag(cwd)
    const imageRef = imageRefFor({appName: app.appName, projectName: app.project.name, registryUrl: registry.url, tag})

    this.log(`==> Build ${imageRef}`)
    await dockerInherit(['build', '-t', imageRef, '-f', flags.dockerfile, flags.context], cwd)

    if (credentials.username && credentials.password) {
      this.log(`==> docker login ${registry.url}`)
      await dockerLogin(registry.url, credentials.username, credentials.password, cwd)
    }

    this.log(`==> Push ${imageRef}`)
    await dockerInherit(['push', imageRef], cwd)

    this.log('==> Memutakhirkan aplikasi & memicu deploy')
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
      this.log(`Deployed: ${dep.imageRef}`)
      return
    }

    if (dep.status === 'failed') {
      this.error(dep.errorMessage ?? 'Deployment gagal.')
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
        this.error('Token tidak berlaku lagi.', {suggestions: ['Jalankan `aoox login`.']})
      }

      if (error instanceof ApiError && error.status === 404) {
        this.error('Aplikasi yang di-link tidak ditemukan lagi.', {suggestions: ['Jalankan `aoox link` lagi.']})
      }

      throw error
    }
  }

  private async pickRegistry(config: Config, registryId?: string): Promise<Registry> {
    const registries = await api<Registry[]>(config, '/registries')
    if (registryId) {
      const found = registries.find((r) => r.id === registryId)
      if (!found) this.error(`Registry ${registryId} tidak ditemukan.`)
      return found
    }

    if (registries.length === 0) {
      this.error('Belum ada registry di panel.', {
        suggestions: ['Provision registry lokal di Infrastruktur, atau tambah registry eksternal.'],
      })
    }

    const selfHosted = registries.find((r) => r.type === 'self-hosted')
    if (selfHosted) return selfHosted
    if (registries.length === 1) return registries[0]

    if (!process.stdin.isTTY) {
      this.error('Ada beberapa registry dan tidak ada yang self-hosted; tidak bisa memilih otomatis.', {
        suggestions: ['Beri --registry <id>.'],
      })
    }

    return select({
      choices: registries.map((r) => ({name: `${r.name} (${r.url})`, value: r})),
      message: 'Pilih registry',
    })
  }

  /** `POST /:id/deploy` returns 409 while another deployment is already running. */
  private async queueDeploy(config: Config, applicationId: string): Promise<Deployment> {
    try {
      return await api<Deployment>(config, `/applications/${applicationId}/deploy`, {method: 'POST'})
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        this.error('Sudah ada deployment yang berjalan untuk aplikasi ini.', {
          suggestions: ['Tunggu deployment itu selesai, lalu coba lagi.'],
        })
      }

      throw error
    }
  }
}
