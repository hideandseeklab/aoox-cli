import {StringDecoder} from 'node:string_decoder'

import {LogLines} from './log-text.js'

/** The part of a socket.io-client `Socket` the sessions use (so tests can fake it). */
export interface StreamSocket {
  close(): unknown
  emit(event: string, ...args: unknown[]): unknown
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- socket.io-client's own listener type
  on(event: string, listener: (...args: any[]) => void): unknown
}

/** Deployment states that mean "still going" (mirrors the API's `ACTIVE`). */
const ACTIVE_DEPLOYMENT = new Set(['building', 'pushing', 'queued', 'starting'])

export type LogMode = {deployment: string; kind: 'deployment'} | {follow: boolean; kind: 'container'; tail: number}

export type LogOutcome =
  | {code: number; kind: 'done';}
  | {kind: 'error'; message: string}
  | {kind: 'interrupted'}

export interface LogSession {
  done: Promise<LogOutcome>
  /** Ctrl+C: stop reading and settle with `interrupted`. */
  interrupt(): void
}

/**
 * Drives the `/logs` socket: subscribes once connected, writes the text,
 * and settles when the stream ends, the deployment finishes or something fails.
 * Never touches the process; the command decides what to print and exit with.
 */
export function runLogSession(opts: {
  keepTimestamps: boolean
  mode: LogMode
  socket: StreamSocket
  write: (text: string) => void
}): LogSession {
  const {keepTimestamps, mode, socket, write} = opts
  const lines = new LogLines(keepTimestamps)
  let settle!: (outcome: LogOutcome) => void
  let settled = false
  const done = new Promise<LogOutcome>((resolve) => {
    settle = (outcome) => {
      if (settled) return
      settled = true
      const rest = lines.flush()
      if (rest) write(rest)
      resolve(outcome)
    }
  })

  socket.on('connect', () => {
    if (mode.kind === 'deployment') socket.emit('subscribe:deployment', mode.deployment)
    else socket.emit('subscribe:container', {follow: Boolean(mode.follow), tail: mode.tail})
  })
  socket.on('connect_error', (error: Error) => settle({kind: 'error', message: `Could not connect: ${error.message}`}))
  socket.on('error', (message: string) => settle({kind: 'error', message: String(message)}))
  socket.on('disconnect', (reason: string) => {
    settle({kind: 'error', message: `The connection was closed (${reason}).`})
  })

  socket.on('container:log', (text: string) => {
    const out = lines.push(String(text))
    if (out) write(out)
  })
  socket.on('container:end', () => settle({code: 0, kind: 'done'}))

  // A deployment snapshot is the whole text so far, sent once on subscribe;
  // later chunks are appended, so both are simply written.
  socket.on('deployment:log', (payload: {chunk: string}) => {
    if (payload.chunk) write(payload.chunk)
  })
  socket.on('deployment:status', (payload: {status: string}) => {
    if (ACTIVE_DEPLOYMENT.has(payload.status)) return
    settle({code: payload.status === 'failed' ? 1 : 0, kind: 'done'})
  })

  return {done, interrupt: () => settle({kind: 'interrupted'})}
}

/** stdin as the console needs it (a TTY `ReadStream` fits). */
export interface ConsoleInput {
  isTTY?: boolean
  off(event: 'data', listener: (chunk: Buffer | string) => void): unknown
  on(event: 'data', listener: (chunk: Buffer | string) => void): unknown
  pause(): unknown
  resume(): unknown
  setRawMode?(mode: boolean): unknown
}

/** stdout as the console needs it. */
export interface ConsoleOutput {
  columns?: number
  isTTY?: boolean
  off(event: 'resize', listener: () => void): unknown
  on(event: 'resize', listener: () => void): unknown
  rows?: number
  write(text: string): unknown
}

export type ConsoleOutcome = {code: number; kind: 'exit'} | {kind: 'error'; message: string}

export function terminalSize(out: Pick<ConsoleOutput, 'columns' | 'rows'>): {cols: number; rows: number} {
  const cols = Number(out.columns)
  const rows = Number(out.rows)
  return {cols: cols >= 1 ? Math.floor(cols) : 80, rows: rows >= 1 ? Math.floor(rows) : 24}
}

/**
 * The shell code the API reports: -1 means it could not read the exit code
 * back (container or daemon already gone). Both a negative and a missing
 * value end as a plain failure.
 */
export function shellExitCode(code: unknown): number {
  const n = typeof code === 'number' ? code : Number.NaN
  return Number.isInteger(n) && n >= 0 && n <= 255 ? n : 1
}

/**
 * Connects the terminal to the `/console` socket: raw stdin goes to the
 * remote shell untouched (so Ctrl+C and Ctrl+D reach it, not this process),
 * output is written as received, and resizes are forwarded. Settles with the
 * remote exit code, or an error. The terminal is always put back.
 */
export function runConsoleSession(opts: {
  socket: StreamSocket
  stdin: ConsoleInput
  stdout: ConsoleOutput
}): Promise<ConsoleOutcome> {
  const {socket, stdin, stdout} = opts
  const decoder = new StringDecoder('utf8')
  let started = false
  let lastError: string | undefined
  let settled = false

  const onData = (chunk: Buffer | string) => {
    const text = typeof chunk === 'string' ? chunk : decoder.write(chunk)
    if (text) socket.emit('input', text)
  }

  const onResize = () => socket.emit('resize', terminalSize(stdout))

  const restore = () => {
    if (!started) return
    started = false
    stdin.off('data', onData)
    stdout.off('resize', onResize)
    try {
      stdin.setRawMode?.(false)
    } catch {
      /* the terminal is already gone */
    }

    stdin.pause()
  }

  return new Promise<ConsoleOutcome>((resolve) => {
    const settle = (outcome: ConsoleOutcome) => {
      if (settled) return
      settled = true
      restore()
      socket.close()
      resolve(outcome)
    }

    socket.on('connect', () => {
      started = true
      stdin.setRawMode?.(true)
      stdin.on('data', onData)
      stdin.resume()
      stdout.on('resize', onResize)
    })
    socket.on('connect_error', (error: Error) => settle({kind: 'error', message: `Could not connect: ${error.message}`}))
    socket.on('output', (text: string) => {
      stdout.write(text)
    })
    // The gateway sends `error` and then disconnects: keep the message for the disconnect.
    socket.on('error', (message: string) => {
      lastError = String(message)
    })
    socket.on('exit', (code: number) => settle({code: shellExitCode(code), kind: 'exit'}))
    socket.on('disconnect', (reason: string) => {
      settle({kind: 'error', message: lastError ?? `The connection was closed (${reason}).`})
    })
  })
}
