import {select} from '@inquirer/prompts'
import {Command, Flags} from '@oclif/core'

import type {Application, Project} from '../lib/types.js'

import {api, ApiError} from '../lib/api.js'
import {MissingCredentialsError} from '../lib/config.js'
import {connectionFlags, loadCredentials} from '../lib/flags.js'
import {writeLink} from '../lib/link.js'

export default class Link extends Command {
  static description = 'Hubungkan folder ini ke sebuah aplikasi di panel (dipakai `aoox deploy`/`aoox logs`)'
  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --project <id> --app <id>',
  ]
  static flags = {
    ...connectionFlags,
    app: Flags.string({description: 'ID aplikasi; lewati pemilihan interaktif'}),
    project: Flags.string({description: 'ID project; lewati pemilihan interaktif'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Link)

    let config
    try {
      config = await loadCredentials(this.config.configDir, flags)
    } catch (error) {
      if (error instanceof MissingCredentialsError) {
        this.error(error.message, {suggestions: ['Jalankan `aoox login`.']})
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

    this.log(`Ter-link: ${project.name} / ${application.name} (${application.appName})`)
    this.log(`Ditulis ke ${path} — aman di-commit, tidak memuat rahasia.`)
  }

  private async pickApplication(
    config: Awaited<ReturnType<typeof loadCredentials>>,
    project: Project,
    appId?: string,
  ): Promise<Application> {
    const apps = await api<Application[]>(config, `/applications?projectId=${project.id}`)
    if (appId) {
      const found = apps.find((a) => a.id === appId)
      if (!found) this.error(`Aplikasi ${appId} tidak ditemukan di project ${project.name}.`)
      return found
    }

    if (apps.length === 0) {
      this.error(`Project "${project.name}" belum punya aplikasi.`, {
        suggestions: ['Buat aplikasinya dulu di panel, lalu jalankan `aoox link` lagi.'],
      })
    }

    if (!process.stdin.isTTY) {
      this.error('Tidak ada terminal interaktif untuk memilih aplikasi.', {
        suggestions: ['Beri --app <id>.'],
      })
    }

    return select({
      choices: apps.map((a) => ({
        description: `${a.sourceType} · ${a.status}`,
        name: `${a.name} (${a.appName})`,
        value: a,
      })),
      message: 'Pilih aplikasi',
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
        this.error('Token tidak berlaku lagi.', {suggestions: ['Jalankan `aoox login`.']})
      }

      throw error
    }

    if (projectId) {
      const found = projects.find((p) => p.id === projectId)
      if (!found) this.error(`Project ${projectId} tidak ditemukan.`)
      return found
    }

    if (projects.length === 0) {
      this.error('Belum ada project di panel ini.', {suggestions: ['Buat project dulu di panel.']})
    }

    if (!process.stdin.isTTY) {
      this.error('Tidak ada terminal interaktif untuk memilih project.', {
        suggestions: ['Beri --project <id>.'],
      })
    }

    return select({
      choices: projects.map((p) => ({name: p.name, value: p})),
      message: 'Pilih project',
    })
  }
}
