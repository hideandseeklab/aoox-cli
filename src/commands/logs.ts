import {Flags} from '@oclif/core'

import type {Deployment} from '../lib/types.js'

import {api, ApiError} from '../lib/api.js'
import {connectionFlags} from '../lib/flags.js'
import {INTERRUPT_EXIT_CODE} from '../lib/interrupt.js'
import {serviceFlag, StreamCommand, targetFlags} from '../lib/stream-command.js'
import {type LogMode, runLogSession} from '../lib/stream-session.js'
import {hintLine} from '../lib/style.js'

export default class Logs extends StreamCommand {
  static description =
    'Show the container logs of an application, a managed database or a compose stack service (with --follow: keep streaming). For an application, --deployment shows the build log of one deployment instead'
  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --follow --tail 50',
    '<%= config.bin %> <%= command.id %> --app web --project shop',
    '<%= config.bin %> <%= command.id %> --database main-db --tail 200',
    '<%= config.bin %> <%= command.id %> --stack blog --service web --follow',
    '<%= config.bin %> <%= command.id %> --deployment latest',
  ]
  static flags = {
    ...connectionFlags,
    ...targetFlags,
    ...serviceFlag,
    deployment: Flags.string({
      description:
        'Show the build log of a deployment (an ID, or "latest") instead of the container logs; keeps following while it runs. Applications only',
      exclusive: ['tail', 'service', 'timestamps'],
    }),
    follow: Flags.boolean({char: 'f', default: false, description: 'Keep streaming new lines until Ctrl+C'}),
    tail: Flags.integer({default: 200, description: 'How many of the last lines to show first (1-5000)', max: 5000, min: 1}),
    timestamps: Flags.boolean({description: 'Keep the timestamp Docker puts in front of every line'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Logs)
    const connection = await this.connect(flags)
    const target = await this.resolveTarget(connection, flags)

    if (flags.deployment && target.kind !== 'application') {
      this.fail('--deployment only works for applications.', 'Databases and stacks have no deployment build log; use --follow for their container logs.')
    }

    const mode: LogMode = flags.deployment
      ? {deployment: await this.deploymentId(connection, target.id, flags.deployment), kind: 'deployment'}
      : {follow: flags.follow, kind: 'container', tail: flags.tail}

    const ticket = await this.requestTicket(connection, target, 'logs', flags.service)
    if (ticket.service && !flags.service) this.logToStderr(hintLine(`service: ${ticket.service}`))

    const socket = await this.openSocket(connection, 'logs', {ticket: ticket.ticket})
    const session = runLogSession({
      keepTimestamps: flags.timestamps,
      mode,
      socket,
      write(text) {
        process.stdout.write(text)
      },
    })
    const onSigint = () => session.interrupt()
    process.once('SIGINT', onSigint)
    const outcome = await session.done
    process.off('SIGINT', onSigint)
    socket.close()

    switch (outcome.kind) {
      case 'done': {
        if (outcome.code !== 0) this.exit(outcome.code)
        return
      }

      case 'error': {
        this.gatewayFailure(outcome.message)
        break
      }

      case 'interrupted': {
        this.exit(INTERRUPT_EXIT_CODE)
      }
    }
  }

  /** `latest` is the newest deployment of the application; anything else is taken as the id. */
  private async deploymentId(
    connection: Parameters<Logs['requestTicket']>[0],
    applicationId: string,
    wanted: string,
  ): Promise<string> {
    if (wanted !== 'latest') return wanted
    try {
      const deployments = await api<Deployment[]>(connection.config, `/applications/${encodeURIComponent(applicationId)}/deployments`)
      if (deployments.length === 0) this.fail('This application has no deployments yet.')
      return deployments[0].id
    } catch (error) {
      if (error instanceof ApiError) return this.failFromApi(error, 'The application')
      throw error
    }
  }
}
