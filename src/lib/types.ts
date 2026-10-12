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

/** An application or stack that uses an environment (`GET /projects/:id/environments`). */
export interface EnvironmentUser {
  id: string
  kind: 'application' | 'compose'
  name: string
}

/** `GET /projects/:id/environments` (names and variable names only, never values). */
export interface ProjectEnvironment {
  id: string
  keys: string[]
  name: string
  /** Variables explicitly flagged not secret (absent on older panels). */
  plainKeys?: string[]
  protected: boolean
  /** Variables flagged secret (absent on older panels). */
  secretKeys?: string[]
  updatedAt: string
  usedBy: EnvironmentUser[]
}

/** `POST /projects/:id/environments/:envId/reveal` (audited). */
export interface EnvironmentReveal {
  keys: string[]
  plainKeys?: string[]
  secretKeys?: string[]
  /** Version for optimistic concurrency; absent on panels older than this field. */
  updatedAt?: string
  variables: string
}

/** One entry of `GET /projects/:id/environments/:envId/versions` (names only). */
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

/** `GET /projects/:id/environments/diff?from=&to=` (names only, never values). */
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
