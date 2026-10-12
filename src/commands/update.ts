import {Command, Flags} from '@oclif/core'
import {spawn} from 'node:child_process'
import {existsSync} from 'node:fs'
import {join} from 'node:path'

import {
  detectInstallMethod,
  fetchPackument,
  installInstructions,
  npmInstallArgs,
  PACKAGE_NAME,
  pickNewest,
} from '../lib/self-update.js'

/**
 * Updates the CLI itself from the npm registry. Needs neither a login nor the
 * panel. (The old meaning of `aoox update` — updating the panel — is now
 * `aoox update panel`.)
 */
export default class Update extends Command {
  static description = 'Update the aoox CLI itself (use `aoox update panel` to update the panel)'
  static examples = ['<%= config.bin %> <%= command.id %>', '<%= config.bin %> <%= command.id %> --check']
  static flags = {
    // Old muscle memory: `aoox update --apply` used to update the panel. Hidden, only to give a clear message.
    apply: Flags.boolean({description: 'Moved to `aoox update panel --apply`', hidden: true}),
    check: Flags.boolean({description: 'Only report whether a newer version exists; change nothing'}),
    token: Flags.string({hidden: true}),
    url: Flags.string({hidden: true}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Update)

    if (flags.apply) {
      this.logToStderr('Panel updates moved to: aoox update panel --apply')
      this.exit(1)
    }

    const installed = this.config.version
    let newest: null | string
    try {
      newest = pickNewest(await fetchPackument(), installed)
    } catch (error) {
      this.logToStderr(`❌ ${(error as Error).message}`)
      this.exit(1)
    }

    if (!newest) {
      this.log(`aoox CLI ${installed} is up to date`)
      return
    }

    const method = detectInstallMethod({
      hasBundledNode:
        existsSync(join(this.config.root, 'bin', 'node')) || existsSync(join(this.config.root, 'bin', 'node.exe')),
      root: this.config.root,
    })

    if (flags.check) {
      this.log(`Update available: aoox CLI ${installed} → ${newest}`)
      this.log(method === 'npm-global' ? 'Run: aoox update' : installInstructions(method, newest).join('\n'))
      return
    }

    if (method !== 'npm-global') {
      this.log(`Update available: aoox CLI ${installed} → ${newest}`)
      this.log(installInstructions(method, newest).join('\n'))
      return
    }

    this.log(`==> npm ${npmInstallArgs(newest).join(' ')}`)
    const code = await runNpm(npmInstallArgs(newest))
    if (code !== 0) {
      this.logToStderr(`❌ npm exited with code ${code}. Run it yourself: npm i -g ${PACKAGE_NAME}@${newest}`)
      this.exit(1)
    }

    this.log(`Updated aoox CLI ${installed} → ${newest}`)
  }
}

function runNpm(args: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    // On Windows npm is npm.cmd, which needs a shell; args are fixed strings plus a validated semver.
    const child = spawn('npm', args, {shell: process.platform === 'win32', stdio: 'inherit'})
    child.on('error', (error: NodeJS.ErrnoException) => {
      reject(error.code === 'ENOENT' ? new Error('npm not found in PATH.') : error)
    })
    child.on('close', (code) => {
      resolve(code ?? 1)
    })
  })
}
