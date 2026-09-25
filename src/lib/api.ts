import type {CliConfig} from './config.js'

/** Panel answered, but not with success. `status: 0` = never reached it. */
export class ApiError extends Error {
  readonly body: unknown
  readonly status: number

  constructor(status: number, message: string, body?: unknown) {
    super(message)
    this.body = body
    this.name = 'ApiError'
    this.status = status
  }
}

/**
 * NestJS error bodies are `{statusCode, error, message}`, where `message` is
 * a string, or an array of them when `ValidationPipe` rejects a DTO.
 */
export function messageFromBody(body: unknown, fallback: string): string {
  if (typeof body === 'string' && body.trim()) return body.trim()
  if (!body || typeof body !== 'object') return fallback
  const {message} = body as {message?: unknown}
  if (typeof message === 'string' && message.trim()) return message.trim()
  if (Array.isArray(message) && message.length > 0) return message.join('; ')
  return fallback
}

export interface RequestOptions {
  body?: unknown
  method?: string
  /** Default 30 s; deploys stream elsewhere, so no request should outlive this. */
  timeoutMs?: number
}

/** One JSON call to the panel API, with the API token as a bearer. */
export async function api<T>(config: CliConfig, path: string, options: RequestOptions = {}): Promise<T> {
  const {body, method = 'GET', timeoutMs = 30_000} = options
  const url = `${config.url}${path}`

  let response: Response
  try {
    response = await fetch(url, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${config.token}`,
        // A CLI run makes one or two requests, so keep-alive buys nothing —
        // ask the server to close its side sooner. This alone does NOT
        // prevent the Windows exit crash multiple requests can trigger (see
        // applyWindowsExitFix in windows-exit-fix.ts, which does).
        connection: 'close',
        ...(body === undefined ? {} : {'content-type': 'application/json'}),
      },
      method,
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    // fetch only rejects for transport problems (DNS, refused, TLS, timeout);
    // an HTTP error status resolves normally.
    const reason = error instanceof Error ? error.message : String(error)
    throw new ApiError(0, `Tidak bisa menghubungi panel di ${config.url} (${reason})`)
  }

  if (response.status === 204) return undefined as T

  const text = await response.text()
  let parsed: unknown
  try {
    parsed = text ? JSON.parse(text) : undefined
  } catch {
    // A proxy or wrong URL can answer with HTML; keep it short in the message.
    parsed = text.slice(0, 200)
  }

  if (!response.ok) {
    throw new ApiError(response.status, messageFromBody(parsed, `${response.status} ${response.statusText}`), parsed)
  }

  return parsed as T
}
