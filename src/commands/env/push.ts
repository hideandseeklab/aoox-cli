import {Flags} from '@oclif/core'
import {readFile} from 'node:fs/promises'
import {resolve} from 'node:path'

import {EnvCommand, environmentCommandFlags} from '../../lib/env-command.js'
import {checkEnvFile, isEmptyChange, summarizeChange} from '../../lib/env-text.js'
import {successLine, warnLine} from '../../lib/style.js'

export default class EnvPush extends EnvCommand {
  static description =
    'Replace the whole text of a variable set environment with a local .env file. Shows what is added, changed and removed and asks before writing (unless --yes); the write fails if someone else changed the environment in between'
  static examples = [
    '<%= config.bin %> <%= command.id %> --file .env',
    '<%= config.bin %> <%= command.id %> --file .env.staging --set shared --env staging --yes',
  ]
  static flags = {
    ...environmentCommandFlags,
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

    for (const w of check.warnings.slice(0, 5)) this.logToStderr(warnLine(w))

    const resolved = await this.resolveEnvironment(flags)
    const current = await this.reveal(resolved, 'change')
    const summary = summarizeChange(current.variables, check.text)
    const sameText = current.variables.replaceAll('\r\n', '\n').trimEnd() === check.text.trimEnd()
    if (isEmptyChange(summary) && sameText) {
      this.log(`${resolved.label} already has exactly this content. Nothing to do.`)
      return
    }

    this.log(`Environment: ${resolved.label}${resolved.environment.protected ? ' (protected)' : ''}`)
    this.show('+', 'added', summary.added)
    this.show('~', 'changed', summary.changed)
    this.show('-', 'removed', summary.removed)
    this.log(`  = unchanged: ${summary.unchanged}`)
    if (isEmptyChange(summary)) this.log('  Only comments or order differ.')
    if (summary.removed.length > 0) {
      this.log('Variables that are not in the file are removed: this replaces the whole environment.')
    }

    if (!(await this.confirmOrFail(`Replace "${resolved.label}" with the contents of ${flags.file}?`, flags.yes))) {
      this.log('Cancelled. Nothing was written.')
      return
    }

    const saved = await this.saveEnvironment(resolved, {
      action: 'push',
      expectedUpdatedAt: current.updatedAt,
      variables: check.text,
    })
    this.log(successLine(`${resolved.label}: pushed ${saved.keys.length} variable${saved.keys.length === 1 ? '' : 's'} (a version was recorded)`))
    this.usedByNote(saved)
  }

  private show(sign: string, label: string, names: string[]): void {
    if (names.length > 0) this.log(`  ${sign} ${label} (${names.length}): ${names.join(', ')}`)
  }
}
