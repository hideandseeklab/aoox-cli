/**
 * Which application, managed database or compose stack `aoox logs` and
 * `aoox exec` talk to, and the panel routes that belong to each kind.
 * Everything here is pure; the network calls live in `stream-command.ts`.
 */

export type TargetKind = 'application' | 'compose' | 'database'

/** `--app` / `--database` / `--stack` as typed (an id or a name). */
export interface TargetFlagValues {
  app?: string
  database?: string
  stack?: string
}

export interface TargetRequest {
  kind: TargetKind
  /** True when it came from the `aoox link` file, not from a flag. */
  linked: boolean
  /** An id (UUID) or a name. */
  ref: string
}

export interface ResolvedTarget {
  id: string
  kind: TargetKind
  name: string
  /** Project name, when the lookup found it (an id given directly skips the lookup). */
  project?: string
}

/** One project of `GET /projects` with the instances of its overview card. */
export interface ProjectWithInstances {
  id: string
  instances: Array<{id: string; kind: TargetKind; name: string}>
  name: string
}

/** A lookup that cannot pick exactly one target; carries ready-to-print hints. */
export class TargetError extends Error {
  readonly hints: string[]

  constructor(message: string, hints: string[] = []) {
    super(message)
    this.hints = hints
    this.name = 'TargetError'
  }
}

const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i

export function isUuid(value: string): boolean {
  return UUID.test(value)
}

export const KIND_LABEL: Record<TargetKind, string> = {
  application: 'Application',
  compose: 'Stack',
  database: 'Database',
}

/** The flag that names each kind, for messages. */
export const KIND_FLAG: Record<TargetKind, string> = {
  application: '--app',
  compose: '--stack',
  database: '--database',
}

/**
 * The target the flags ask for; without any, the application linked with
 * `aoox link`; null when there is neither. oclif already makes the three
 * flags mutually exclusive.
 */
export function targetRequest(flags: TargetFlagValues, linkedApplicationId?: string): null | TargetRequest {
  if (flags.app) return {kind: 'application', linked: false, ref: flags.app.trim()}
  if (flags.database) return {kind: 'database', linked: false, ref: flags.database.trim()}
  if (flags.stack) return {kind: 'compose', linked: false, ref: flags.stack.trim()}
  if (linkedApplicationId) return {kind: 'application', linked: true, ref: linkedApplicationId}
  return null
}

function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/**
 * Finds `ref` (a name, compared case-insensitively) among the instances of
 * `kind`. A UUID is never looked up here: the panel answers 404 for it itself.
 * `project` (id or name) narrows two resources with the same name apart.
 */
export function resolveByName(
  projects: ProjectWithInstances[],
  kind: TargetKind,
  ref: string,
  project?: string,
): ResolvedTarget {
  const inScope = project
    ? projects.filter((p) => p.id === project || sameName(p.name, project))
    : projects
  if (project && inScope.length === 0) {
    throw new TargetError(`Project "${project}" not found.`, [
      `Projects you can see: ${projects.map((p) => p.name).join(', ') || 'none'}`,
    ])
  }

  const matches = inScope.flatMap((p) =>
    p.instances.filter((i) => i.kind === kind && sameName(i.name, ref)).map((i) => ({...i, project: p.name})),
  )
  if (matches.length === 1) {
    const [m] = matches
    return {id: m.id, kind, name: m.name, project: m.project}
  }

  if (matches.length > 1) {
    throw new TargetError(`${matches.length} ${KIND_LABEL[kind].toLowerCase()}s are named "${ref}".`, [
      ...matches.map((m) => `  ${m.name} in project "${m.project}" (${m.id})`),
      `Pass --project <name> or the ${KIND_LABEL[kind].toLowerCase()} id.`,
    ])
  }

  const available = inScope.flatMap((p) => p.instances.filter((i) => i.kind === kind).map((i) => i.name))
  throw new TargetError(`${KIND_LABEL[kind]} "${ref}" not found.`, [
    available.length > 0
      ? `${KIND_LABEL[kind]}s you can see: ${[...new Set(available)].join(', ')}`
      : `You can see no ${KIND_LABEL[kind].toLowerCase()}s${project ? ' in that project' : ''}.`,
  ])
}

export type TicketPurpose = 'console' | 'logs'

/** `POST` route that issues the websocket ticket for this target. */
export function ticketPath(kind: TargetKind, id: string, purpose: TicketPurpose): string {
  const base = kind === 'application' ? 'applications' : kind === 'database' ? 'databases' : 'compose-apps'
  return `/${base}/${encodeURIComponent(id)}/${purpose === 'logs' ? 'log-ticket' : 'console-ticket'}`
}

/** Body of the ticket request: only a compose stack takes a service. */
export function ticketBody(kind: TargetKind, service?: string): undefined | {service?: string} {
  if (kind !== 'compose') return undefined
  return service ? {service} : {}
}

/** Socket.IO namespace of each purpose. */
export const NAMESPACE: Record<TicketPurpose, string> = {console: '/console', logs: '/logs'}
