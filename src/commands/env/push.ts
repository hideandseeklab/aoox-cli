import {Flags} from '@oclif/core'
import {readFile} from 'node:fs/promises'
import {resolve} from 'node:path'

import type {ProjectEnvironment} from '../../lib/types.js'

import {api, ApiError} from '../../lib/api.js'
import {EnvCommand, environmentFlag, projectFlags} from '../../lib/env-command.js'
import {checkEnvFile, isEmptyChange, summarizeChange} from '../../lib/env-text.js'

export default class EnvPush extends EnvCommand {
  static description =
    'Replace the whole text of an environment with a local .env file. Shows what is added, changed and removed and asks before writing (unless --yes); the write fails if someone else changed the environment in between'
  static examples = [
    '<%= config.bin %> <%= command.id %> --file .env',
    '<%= config.bin %> <%= command.id %> --file .env.staging --env staging --yes',
  ]
  static flags = {
    ...projectFlags,
    ...environmentFlag,
    file: Flags.string({description: 'The .env file to upload', required: true}),
    yes: Flags.boolean({char: 'y', description: 'Do not ask for confirmation'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(EnvPush)
    const path = resolve(process.cwd(), flags.file)
    let raw: string
    try {
      raw = await readFile(path, 'utf8')
    } catch (error) {
      const {code} = error as NodeJS.ErrnoException
      this.fail(code === 'ENOENT' ? `${flags.file} does not exist.` : `Cannot read ${flags.file}: ${(error as Error).message}`)
    }

    const check = checkEnvFile(raw)
    if (check.problems.length > 0) {
      const more = check.problems.length > 10 ? [`  ... and ${check.problems.length - 10} more`] : []
      this.fail(`${flags.file} cannot be uploaded:`, ...check.problems.slice(0, 10).map((p) => `  ${p}`), ...more)
    }

    for (const w of check.warnings.slice(0, 5)) this.warn(w)

    const resolved = await this.resolveEnvironment(flags)
    const current = await this.reveal(resolved, 'change')
    const summary = summarizeChange(current.variables, check.text)
    const sameText = current.variables.replaceAll('\r\n', '\n').trimEnd() === check.text.trimEnd()
    if (isEmptyChange(summary) && sameText) {
      this.log(`${resolved.environment.name} already has exactly this content. Nothing to do.`)
      return
    }

    this.log(`Project: ${resolved.projectName} · environment: ${resolved.environment.name}${resolved.environment.protected ? ' (protected)' : ''}`)
    this.show('+', 'added', summary.added)
    this.show('~', 'changed', summary.changed)
    this.show('-', 'removed', summary.removed)
    this.log(`  = unchanged: ${summary.unchanged}`)
    if (isEmptyChange(summary)) this.log('  Only comments or order differ.')
    if (summary.removed.length > 0) {
      this.log('Variables that are not in the file are removed: this replaces the whole environment.')
    }

    if (!(await this.confirmOrFail(`Replace "${resolved.environment.name}" with the contents of ${flags.file}?`, flags.yes))) {
      this.log('Cancelled. Nothing was written.')
      return
    }

    const expectedUpdatedAt = current.updatedAt ?? resolved.environment.updatedAt
    let saved: ProjectEnvironment
    try {
      saved = await api<ProjectEnvironment>(
        resolved.config,
        `/projects/${resolved.projectId}/environments/${resolved.environment.id}`,
        {body: {action: 'push', expectedUpdatedAt, variables: check.text}, method: 'PUT'},
      )
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 400) this.fail(error.message)
        this.failFromApi(error, {environment: resolved.environment.name, verb: 'change'})
      }

      throw error
    }

    this.log(`${resolved.environment.name}: pushed ${saved.keys.length} variable${saved.keys.length === 1 ? '' : 's'} (a version was recorded)`)
    if (saved.usedBy.length > 0) {
      this.log(`Used by ${saved.usedBy.map((u) => u.name).join(', ')}: they pick the change up on their next deploy.`)
    }
  }

  private show(sign: string, label: string, names: string[]): void {
    if (names.length > 0) this.log(`  ${sign} ${label} (${names.length}): ${names.join(', ')}`)
  }
}
