import {Flags} from '@oclif/core'
import {existsSync} from 'node:fs'
import {resolve} from 'node:path'

import {EnvCommand, environmentCommandFlags} from '../../lib/env-command.js'
import {FileExistsError, gitIgnoreStatus, writeEnvFile} from '../../lib/env-file.js'
import {defaultFileFor, formatEnv, hasReferences, keysOf, type PullFormat, REFERENCE_NOTE} from '../../lib/env-text.js'
import {successLine, warnLine} from '../../lib/style.js'

export default class EnvPull extends EnvCommand {
  static description =
    'Write the variables of a variable set environment to a local file (mode 0600), or to standard output with --file -. Refuses to overwrite unless --force. The read is recorded in the audit log'
  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --set shared --env staging --file .env.staging',
    '<%= config.bin %> <%= command.id %> --force',
    '<%= config.bin %> <%= command.id %> --format json --file -',
    '<%= config.bin %> <%= command.id %> --format shell --file -',
  ]
  static flags = {
    ...environmentCommandFlags,
    file: Flags.string({
      description:
        'File to write, relative to the current folder; "-" writes to standard output (nothing else is printed there). Default: .env, .env.json or .env.sh by format',
    }),
    force: Flags.boolean({description: 'Overwrite the file if it exists'}),
    format: Flags.string({
      default: 'dotenv',
      description: "dotenv (the stored text, comments kept), json ({\"KEY\":\"value\"}) or shell (export KEY='value' lines for eval)",
      options: ['dotenv', 'json', 'shell'],
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(EnvPull)
    const format = flags.format as PullFormat
    const toStdout = flags.file === '-'
    const file = flags.file ?? defaultFileFor(format)
    const cwd = process.cwd()
    const path = resolve(cwd, file)

    const resolved = await this.resolveEnvironment(flags)
    // Check before the (audited) reveal so a refused overwrite costs nothing.
    if (!toStdout && !flags.force && existsSync(path)) {
      this.fail(`${file} already exists.`, 'Add --force to overwrite it, or choose another file with --file.')
    }

    const revealed = await this.reveal(resolved)
    const body = formatEnv(revealed.variables, format)

    if (toStdout) {
      // Standard output carries only the data (so it can be piped or eval'ed);
      // notes go to standard error.
      process.stdout.write(body)
      if (hasReferences(revealed.variables)) this.logToStderr(`Note: ${REFERENCE_NOTE}`)
      return
    }

    try {
      await writeEnvFile(path, body, flags.force)
    } catch (error) {
      if (error instanceof FileExistsError) {
        this.fail(`${file} already exists.`, 'Add --force to overwrite it, or choose another file with --file.')
      }

      throw error
    }

    const count = keysOf(revealed.variables).length
    this.log(successLine(`Wrote ${count} variable${count === 1 ? '' : 's'} from "${resolved.label}" to ${file}`))
    if (hasReferences(revealed.variables)) {
      this.logToStderr(warnLine(REFERENCE_NOTE))
    }

    if ((await gitIgnoreStatus(file, cwd)) === 'not-ignored') {
      this.logToStderr(warnLine(
        `${file} is not covered by .gitignore, so it could be committed with its secrets. Add it, e.g.: echo "${file}" >> .gitignore`,
      ))
    }
  }
}
