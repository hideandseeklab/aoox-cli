import {connectionFlags} from '../lib/flags.js'
import {serviceFlag, StreamCommand, targetFlags} from '../lib/stream-command.js'
import {runConsoleSession, terminalSize} from '../lib/stream-session.js'
import {hintLine} from '../lib/style.js'

export default class Exec extends StreamCommand {
  static description =
    'Open an interactive shell in the container of an application, a managed database or a compose stack service (bash if the image has it, else sh), like `docker exec -it`. The command exits with the shell\'s exit code'
  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --app web --project shop',
    '<%= config.bin %> <%= command.id %> --database main-db',
    '<%= config.bin %> <%= command.id %> --stack blog --service web',
  ]
  static flags = {
    ...connectionFlags,
    ...targetFlags,
    ...serviceFlag,
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Exec)
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      this.fail(
        'aoox exec needs an interactive terminal (stdin and stdout must be a TTY).',
        'It cannot run with piped input or output; use it from a terminal window.',
      )
    }

    const connection = await this.connect(flags)
    const target = await this.resolveTarget(connection, flags)
    const ticket = await this.requestTicket(connection, target, 'console', flags.service)
    if (ticket.service && !flags.service) this.logToStderr(hintLine(`service: ${ticket.service}`))

    const {cols, rows} = terminalSize(process.stdout)
    const socket = await this.openSocket(connection, 'console', {cols, rows, ticket: ticket.ticket})
    const outcome = await runConsoleSession({socket, stdin: process.stdin, stdout: process.stdout})

    if (outcome.kind === 'error') this.gatewayFailure(outcome.message)
    if (outcome.code !== 0) this.exit(outcome.code)
  }
}
