import {Command, Flags} from '@oclif/core'
import {io} from 'socket.io-client'

import type {CliConfig} from './config.js'
import type {ProjectWithInstances, ResolvedTarget, TargetFlagValues, TicketPurpose} from './target.js'

import {api, ApiError} from './api.js'
import {MissingCredentialsError, readConfig} from './config.js'
import {discover} from './discovery.js'
import {loadCredentials} from './flags.js'
import {type LinkFile, readLink} from './link.js'
import {dashboardUrlFor, originOf} from './origin.js'
import {warnIfOutdated} from './outdated.js'
import {type StreamSocket} from './stream-session.js'
import {errorLine, warnLine} from './style.js'
import {isUuid, KIND_LABEL, NAMESPACE, resolveByName, TargetError, targetRequest, ticketBody, ticketPath} from './target.js'


/** `--app` / `--database` / `--stack` (+ `--project`): which resource the command talks to. */
export const targetFlags = {
  app: Flags.string({
    description: 'Application ID or name; defaults to the application linked with `aoox link`',
    exclusive: ['database', 'stack'],
  }),
  database: Flags.string({
    description: 'Managed database ID or name',
    exclusive: ['app', 'stack'],
  }),
  project: Flags.string({
    description: 'Project ID or name, to tell apart resources that share a name',
  }),
  stack: Flags.string({
    description: 'Compose stack ID or name',
    exclusive: ['app', 'database'],
  }),
}

export const serviceFlag = {
  service: Flags.string({
    dependsOn: ['stack'],
    description: 'Service of the compose stack (required when the stack has more than one)',
  }),
}

type ConnectionFlagValues = {token?: string; url?: string}

export interface Connection {
  config: CliConfig
  link: LinkFile | null
  /** The raw `--url` / `AOOX_URL`, needed to find the dashboard address. */
  rawUrl?: string
}

export interface Ticket {
  containerId?: string
  expiresIn: number
  service?: string
  ticket: string
}

/** Shared plumbing of `aoox logs` and `aoox exec`: credentials, target lookup, tickets, websocket. */
export abstract class StreamCommand extends Command {
  protected async connect(flags: ConnectionFlagValues): Promise<Connection> {
    let link: LinkFile | null
    try {
      link = await readLink(process.cwd())
    } catch (error) {
      this.fail((error as Error).message)
    }

    try {
      const config = await loadCredentials(this.config.configDir, flags, link?.url)
      await warnIfOutdated((m) => this.logToStderr(warnLine(m)), this.config.version, config)
      return {config, link, rawUrl: flags.url}
    } catch (error) {
      if (error instanceof MissingCredentialsError) this.fail(error.message, 'Run `aoox login`.')
      throw error
    }
  }

  /** Prints `error` + the first line, plain hint lines after it, to stderr and exits 1. */
  protected fail(...lines: string[]): never {
    for (const [i, line] of lines.entries()) {
      this.logToStderr(i === 0 ? errorLine(line) : line)
    }

    this.exit(1)
  }

  /** Maps an API failure onto the CLI's error style; always ends the command. */
  protected failFromApi(error: unknown, what?: string): never {
    if (!(error instanceof ApiError)) throw error
    switch (error.status) {
      case 401: {
        this.fail('The token is no longer valid.', 'Run `aoox login` to save a new token.')
        break
      }

      case 404: {
        this.fail(`${what ?? 'That resource'} was not found, or you have no access to it.`)
        break
      }

      default: {
        this.fail(error.message)
      }
    }
  }

  /** The line printed for a gateway `error` message; the origin refusal gets a hint. */
  protected gatewayFailure(message: string): never {
    if (/origin not allowed/i.test(message)) {
      this.fail(
        'The panel refused the connection: the dashboard address this CLI sends does not match the panel (WEB_ORIGIN).',
        'Run `aoox login` again with the exact address you open the dashboard with.',
      )
    }

    this.fail(message)
  }

  /** Websocket to a gateway namespace, sending the dashboard as `Origin` the way a browser would. */
  protected async openSocket(
    connection: Connection,
    purpose: TicketPurpose,
    auth: Record<string, unknown>,
  ): Promise<StreamSocket> {
    const stored = await readConfig(this.config.configDir)
    let dashboard: null | string
    try {
      dashboard = await dashboardUrlFor(stored, connection.config.url, connection.rawUrl, discover)
    } catch (error) {
      this.fail((error as Error).message)
    }

    if (!dashboard) {
      this.fail(
        `The dashboard address for ${connection.config.url} is not known, and the panel only accepts websocket connections from it.`,
        'Run `aoox login` again and type the address you open the dashboard with (or pass --url <dashboard address>).',
      )
    }

    return io(`${connection.config.url}${NAMESPACE[purpose]}`, {
      auth,
      extraHeaders: {origin: originOf(dashboard)},
      reconnection: false,
      // Plain polling cannot carry a long stream or a raw terminal.
      transports: ['websocket'],
    }) as unknown as StreamSocket
  }

  /** `POST` the ticket route of `target`; every refusal the API gives becomes a readable line. */
  protected async requestTicket(
    connection: Connection,
    target: ResolvedTarget,
    purpose: TicketPurpose,
    service?: string,
  ): Promise<Ticket> {
    const label = `${KIND_LABEL[target.kind]} "${target.name}"`
    try {
      return await api<Ticket>(connection.config, ticketPath(target.kind, target.id, purpose), {
        body: ticketBody(target.kind, service),
        method: 'POST',
      })
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        this.fail(error.message, ...forbiddenHints(target.kind, purpose))
      }

      return this.failFromApi(error, label)
    }
  }

  /** The application, database or stack the flags (or the link) name, looked up by id or name. */
  protected async resolveTarget(
    connection: Connection,
    flags: TargetFlagValues & {project?: string},
  ): Promise<ResolvedTarget> {
    const request = targetRequest(flags, connection.link?.applicationId)
    if (!request) {
      this.fail(
        'No application, database or stack to use.',
        'Run `aoox link` in this folder, or pass --app, --database or --stack (an ID or a name).',
      )
    }

    // An id needs no lookup: the ticket request answers 404 for one that is not visible.
    if (isUuid(request.ref)) {
      return {id: request.ref, kind: request.kind, name: request.linked ? connection.link!.applicationName : request.ref}
    }

    let projects: ProjectWithInstances[]
    try {
      projects = await api<ProjectWithInstances[]>(connection.config, '/projects')
    } catch (error) {
      return this.failFromApi(error, 'Your project list')
    }

    try {
      return resolveByName(projects, request.kind, request.ref, flags.project)
    } catch (error) {
      if (error instanceof TargetError) this.fail(error.message, ...error.hints)
      throw error
    }
  }
}

/** Hints that go with a 403 on a ticket request. */
export function forbiddenHints(kind: 'application' | 'compose' | 'database', purpose: TicketPurpose): string[] {
  if (purpose === 'console') {
    return [
      'A shell needs the developer role or higher in the project, and an API token that is not read-only.',
    ]
  }

  return kind === 'database' ? ['Database logs need the developer role or higher in the project.'] : []
}
