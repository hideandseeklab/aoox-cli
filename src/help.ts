import {Help} from '@oclif/core'

import {formatConnection, gatherConnection} from './lib/connection-summary.js'

/**
 * Plain `aoox` (no arguments) also shows which panel the CLI is connected
 * to, so people with several panels are not guessing. `aoox --help` and
 * `aoox <command> --help` are the stock oclif help.
 */
export default class AooxHelp extends Help {
  protected async showRootHelp(): Promise<void> {
    await super.showRootHelp()
    if (process.argv.length > 2) return

    const summary = await gatherConnection(this.config.configDir)
    this.log(`\n${formatConnection(summary).join('\n')}\n`)
  }
}
