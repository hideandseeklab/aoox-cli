/**
 * Response shapes mirrored by hand from the API, the same way the web app
 * keeps its own `*.entity.ts` — there is no shared package, so anything
 * added here must match a DTO in aoox-api.
 */

/** `GET /auth/me` → `MeResponseDto`. */
export interface AuthUser {
  email: string
  id: string
  name: null | string
  role: string
  twoFactorEnabled: boolean
  /** Running API version; absent on panels older than this field. */
  version?: string
}

/** `GET /projects` (fields this CLI uses; the DTO carries more). */
export interface Project {
  id: string
  name: string
}

export type ApplicationStatus = 'error' | 'idle' | 'running' | 'stopped'
export type SourceType = 'git' | 'image'

/** `GET /applications?projectId=` (fields this CLI uses). */
export interface Application {
  appName: string
  id: string
  imageRef: null | string
  imageRegistryId: null | string
  name: string
  projectId: string
  sourceType: SourceType
  status: ApplicationStatus
}

/** `GET /applications/:id` — unlike the list, this one nests `project` (needed for the image repo name). */
export interface ApplicationDetail extends Application {
  project: {id: string; name: string}
}

/** `GET /registries` → `RegistryDto` (never carries the password). */
export interface Registry {
  domain: null | string
  id: string
  imagePrefix: null | string
  name: string
  type: 'external' | 'self-hosted'
  url: string
  username: null | string
}

/** `GET /registries/:id/credentials` → `RegistryCredentialsDto`. */
export interface RegistryCredentials {
  password: null | string
  url: string
  username: null | string
}

export type DeploymentStatus = 'building' | 'failed' | 'pushing' | 'queued' | 'starting' | 'success'

/** `POST /applications/:id/deploy` and `GET /deployments/:id`. */
export interface Deployment {
  errorMessage: null | string
  id: string
  imageRef: null | string
  logs: string
  status: DeploymentStatus
}

/** An application or stack that links a set environment (limited to projects the caller may see). */
export interface EnvironmentUser {
  id: string
  kind: 'application' | 'compose'
  name: string
  /** Position of the link in that resource's ordered list (0 = first). */
  position: number
  projectId: string
  projectName: string
}

/** One environment in `GET /variable-sets` (names and counts only). */
export interface EnvironmentSummary {
  id: string
  keyCount: number
  name: string
  protected: boolean
  updatedAt: string
  usedByCount: number
}

export type SetRole = 'admin' | 'developer' | 'platform' | 'viewer'

interface VariableSetBase {
  canManage: boolean
  description: null | string
  id: string
  name: string
  /** Explicit shares the caller may see. */
  projects: Array<{id: string; name: string}>
  role: SetRole
  sharedWithAll: boolean
  slug: string
  usage: {applications: number; composeApps: number}
}

/** `GET /variable-sets` (sorted by name). */
export interface VariableSetSummary extends VariableSetBase {
  environments: EnvironmentSummary[]
}

/** `GET /variable-sets/:id`, `PUT …/environments/:envId` (names and flags, never values). */
export interface EnvironmentView {
  id: string
  keys: string[]
  name: string
  plainKeys: string[]
  protected: boolean
  secretKeys: string[]
  updatedAt: string
  usedBy: EnvironmentUser[]
}

/** `GET /variable-sets/:id`. */
export interface VariableSetDetail extends VariableSetBase {
  environments: EnvironmentView[]
}

/** `POST /variable-sets/:id/environments/:envId/reveal` (audited). */
export interface RevealView {
  keys: string[]
  plainKeys: string[]
  secretKeys: string[]
  /** Version for optimistic concurrency (`expectedUpdatedAt`). */
  updatedAt: string
  variables: string
}

/** One link of `GET/PUT /applications/:id/variable-sets` and `/compose-apps/:id/variable-sets`. */
export interface LinkView {
  environmentId: string
  environmentName: string
  keys: string[]
  /** Keys defined by the owner's own env (and no later link): the own env wins. */
  overriddenByOwnEnv: string[]
  /** 0-based; later links override earlier ones on the same key. */
  position: number
  protected: boolean
  setId: string
  setName: string
  setSlug: string
  /** Keys also defined by a later link, which wins. */
  shadowedKeys: string[]
}

/** Fields of `GET /applications/:id` and `GET /compose-apps/:id` that `aoox run` and the link commands use. */
export interface LinkOwnerDetail {
  /** The owner's own `KEY=VALUE` text; it always wins over the linked sets. */
  env: null | string
  id: string
  name: string
  projectId: string
  /** Applications only: the Infisical source (`sync` = every secret injected at deploy time). */
  secretSource?: null | {sync: boolean}
  variableSets: LinkView[]
}

/** One entry of `GET /variable-sets/:id/environments/:envId/versions` (names only). */
export interface EnvironmentVersion {
  action: string
  authorEmail: null | string
  createdAt: string
  current: boolean
  detail: null | string
  id: string
  summary: {added: string[]; changed: string[]; flags: string[]; removed: string[]}
  via: string
}

/** `GET /variable-sets/:id/diff?from=&to=` (names only, never values). */
export interface EnvironmentDiff {
  comparable: boolean
  /** Null when the caller may not reveal both sides. */
  different: null | string[]
  from: {id: string; name: string}
  inBoth: string[]
  onlyInFrom: string[]
  onlyInTo: string[]
  same: null | string[]
  to: {id: string; name: string}
}
