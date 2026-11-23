/* eslint-disable mocha/max-top-level-suites, unicorn/consistent-function-scoping, unicorn/prefer-event-target -- socket and tty fakes */
import {expect} from 'chai'
import {EventEmitter} from 'node:events'

import {
  type ConsoleInput,
  type ConsoleOutput,
  runConsoleSession,
  runLogSession,
  shellExitCode,
  type StreamSocket,
  terminalSize,
} from '../../src/lib/stream-session.js'

class FakeSocket extends EventEmitter implements StreamSocket {
  closed = false
  sent: unknown[][] = []

  close() {
    this.closed = true
  }

  // What the client sends to the server is recorded, not delivered.
  override emit(event: string, ...args: unknown[]): boolean {
    this.sent.push([event, ...args])
    return true
  }

  /** What the server would send to the client. */
  fromServer(event: string, ...args: unknown[]) {
    super.emit(event, ...args)
  }
}

const T = '2026-11-23T10:00:00Z'

describe('runLogSession', () => {
  function start(mode: Parameters<typeof runLogSession>[0]['mode']) {
    const socket = new FakeSocket()
    const written: string[] = []
    const session = runLogSession({keepTimestamps: false, mode, socket, write: (t) => written.push(t)})
    return {session, socket, written}
  }

  it('subscribes with tail and follow once connected', () => {
    const {socket} = start({follow: true, kind: 'container', tail: 50})
    socket.fromServer('connect')
    expect(socket.sent).to.deep.equal([['subscribe:container', {follow: true, tail: 50}]])
  })

  it('ends with code 0 on container:end after writing the lines', async () => {
    const {session, socket, written} = start({follow: false, kind: 'container', tail: 5})
    socket.fromServer('connect')
    socket.fromServer('container:log', `${T} a\n${T} b`)
    socket.fromServer('container:end')
    expect(await session.done).to.deep.equal({code: 0, kind: 'done'})
    expect(written.join('')).to.equal('a\nb')
  })

  it('Ctrl+C settles as interrupted', async () => {
    const {session} = start({follow: true, kind: 'container', tail: 5})
    session.interrupt()
    expect(await session.done).to.deep.equal({kind: 'interrupted'})
  })

  it('a gateway error becomes the outcome, a later disconnect does not replace it', async () => {
    const {session, socket} = start({follow: true, kind: 'container', tail: 5})
    socket.fromServer('error', 'no container')
    socket.fromServer('disconnect', 'io server disconnect')
    expect(await session.done).to.deep.equal({kind: 'error', message: 'no container'})
  })

  it('connect_error is reported with the reason', async () => {
    const {session, socket} = start({follow: true, kind: 'container', tail: 5})
    socket.fromServer('connect_error', new Error('websocket error'))
    expect(await session.done).to.deep.equal({kind: 'error', message: 'Could not connect: websocket error'})
  })

  it('a deployment: snapshot then chunks, exit 0 on success, 1 on failed, silent while active', async () => {
    const ok = start({deployment: 'd1', kind: 'deployment'})
    ok.socket.fromServer('connect')
    expect(ok.socket.sent).to.deep.equal([['subscribe:deployment', 'd1']])
    ok.socket.fromServer('deployment:log', {chunk: 'start\n', deploymentId: 'd1', snapshot: true})
    ok.socket.fromServer('deployment:status', {status: 'building'})
    ok.socket.fromServer('deployment:log', {chunk: 'more\n', deploymentId: 'd1'})
    ok.socket.fromServer('deployment:status', {status: 'success'})
    expect(await ok.session.done).to.deep.equal({code: 0, kind: 'done'})
    expect(ok.written.join('')).to.equal('start\nmore\n')

    const bad = start({deployment: 'd2', kind: 'deployment'})
    bad.socket.fromServer('deployment:status', {status: 'failed'})
    expect(await bad.session.done).to.deep.equal({code: 1, kind: 'done'})
  })
})

class FakeIn extends EventEmitter {
  isTTY = true
  paused = false
  raw: boolean[] = []

  pause() {
    this.paused = true
  }

  resume() {
    this.paused = false
  }

  setRawMode(mode: boolean) {
    this.raw.push(mode)
  }
}

class FakeOut extends EventEmitter {
  columns = 100
  isTTY = true
  out: string[] = []
  rows = 30

  write(text: string) {
    this.out.push(text)
  }
}

describe('runConsoleSession', () => {
  function start() {
    const socket = new FakeSocket()
    const stdin = new FakeIn()
    const stdout = new FakeOut()
    const done = runConsoleSession({
      socket,
      stdin: stdin as unknown as ConsoleInput,
      stdout: stdout as unknown as ConsoleOutput,
    })
    return {done, socket, stdin, stdout}
  }

  it('goes raw on connect, forwards input untouched (Ctrl+C and Ctrl+D included) and writes output', async () => {
    const {done, socket, stdin, stdout} = start()
    socket.fromServer('connect')
    expect(stdin.raw).to.deep.equal([true])
    stdin.emit('data', Buffer.from('ls\r'))
    stdin.emit('data', Buffer.from([0x03]))
    stdin.emit('data', Buffer.from([0x04]))
    expect(socket.sent).to.deep.equal([['input', 'ls\r'], ['input', '\u0003'], ['input', '\u0004']])
    socket.fromServer('output', 'hello\r\n')
    expect(stdout.out).to.deep.equal(['hello\r\n'])
    socket.fromServer('exit', 0)
    expect(await done).to.deep.equal({code: 0, kind: 'exit'})
    expect(socket.closed).to.equal(true)
  })

  it('does not split a multi-byte character across chunks', () => {
    const {socket, stdin} = start()
    socket.fromServer('connect')
    const euro = Buffer.from([0xe2, 0x82, 0xac])
    stdin.emit('data', euro.subarray(0, 1))
    stdin.emit('data', euro.subarray(1))
    expect(socket.sent.map((s) => s[1]).join('')).to.equal('€')
  })

  it('forwards terminal resizes', () => {
    const {socket, stdout} = start()
    socket.fromServer('connect')
    stdout.columns = 120
    stdout.rows = 40
    stdout.emit('resize')
    expect(socket.sent).to.deep.equal([['resize', {cols: 120, rows: 40}]])
  })

  it('restores the terminal and stops listening when the shell exits with a code', async () => {
    const {done, socket, stdin, stdout} = start()
    socket.fromServer('connect')
    socket.fromServer('exit', 3)
    expect(await done).to.deep.equal({code: 3, kind: 'exit'})
    expect(stdin.raw).to.deep.equal([true, false])
    expect(stdin.paused).to.equal(true)
    expect(stdin.listenerCount('data')).to.equal(0)
    expect(stdout.listenerCount('resize')).to.equal(0)
  })

  it('turns an unknown exit code (-1) into 1', async () => {
    const {done, socket} = start()
    socket.fromServer('connect')
    socket.fromServer('exit', -1)
    expect(await done).to.deep.equal({code: 1, kind: 'exit'})
  })

  it('reports the gateway error that came before the disconnect', async () => {
    const {done, socket, stdin} = start()
    socket.fromServer('connect')
    socket.fromServer('error', 'origin not allowed')
    socket.fromServer('disconnect', 'io server disconnect')
    expect(await done).to.deep.equal({kind: 'error', message: 'origin not allowed'})
    expect(stdin.raw).to.deep.equal([true, false])
  })

  it('a bare disconnect says the connection was closed', async () => {
    const {done, socket} = start()
    socket.fromServer('connect')
    socket.fromServer('disconnect', 'transport close')
    expect(await done).to.deep.equal({kind: 'error', message: 'The connection was closed (transport close).'})
  })

  it('never enters raw mode when the connection fails', async () => {
    const {done, socket, stdin} = start()
    socket.fromServer('connect_error', new Error('nope'))
    expect(await done).to.deep.equal({kind: 'error', message: 'Could not connect: nope'})
    expect(stdin.raw).to.deep.equal([])
  })
})

describe('terminal helpers', () => {
  it('falls back to 80x24 and floors the size', () => {
    expect(terminalSize({})).to.deep.equal({cols: 80, rows: 24})
    expect(terminalSize({columns: 132.7, rows: 43})).to.deep.equal({cols: 132, rows: 43})
  })

  it('maps shell exit codes', () => {
    expect(shellExitCode(0)).to.equal(0)
    expect(shellExitCode(130)).to.equal(130)
    expect(shellExitCode(-1)).to.equal(1)
    expect(shellExitCode(null)).to.equal(1)
    expect(shellExitCode(999)).to.equal(1)
  })
})
