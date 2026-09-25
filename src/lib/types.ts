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
