import {expect} from 'chai'
import {mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {
  addAuthorizedKey,
  authorizeTerminalKey,
  ensureTerminalKey,
  parsePasswd,
  publicKeyLine,
  skipReason,
  terminalKeyPlan,
  writeAuthorizedKey,
} from '../../src/lib/terminal-key.js'

const KEY = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIabc aoox-terminal'
const OTHER = 'ssh-rsa AAAAB3NzaOTHER other@laptop'
const ctx = {explicitCredential: false, noAuthorize: false, platform: 'linux', root: true, user: 'ubuntu'}
const mode = (path: string) => statSync(path).mode.toString(8).slice(-3)

describe('terminal key', () => {
describe('terminal key plan', () => {
  it('uses the file names and ssh-keygen arguments the installers agree on', () => {
    const plan = terminalKeyPlan('/opt/aoox')
    expect(plan.secretsDir).to.equal('/opt/aoox/secrets')
    expect(plan.privateKey).to.equal('/opt/aoox/secrets/terminal_ssh_key')
    expect(plan.publicKey).to.equal('/opt/aoox/secrets/terminal_ssh_key.pub')
    expect(plan.keygenArgs).to.deep.equal(['-q', '-t', 'ed25519', '-N', '', '-C', 'aoox-terminal', '-f', plan.privateKey])
  })
})

describe('skipReason', () => {
  it('runs for root on Linux with a valid user', () => {
    expect(skipReason(ctx)).to.equal(null)
  })

  it('skips for the opt-out, non-Linux, non-root, explicit credentials and bad users', () => {
    expect(skipReason({...ctx, noAuthorize: true})).to.contain('--no-terminal-authorize')
    expect(skipReason({...ctx, platform: 'darwin'})).to.equal('not Linux')
    expect(skipReason({...ctx, root: false})).to.equal('not root')
    expect(skipReason({...ctx, explicitCredential: true})).to.contain('explicit')
    expect(skipReason({...ctx, user: undefined})).to.contain('TERMINAL_SSH_USER')
    expect(skipReason({...ctx, user: 'a;b'})).to.contain('TERMINAL_SSH_USER')
  })
})

describe('publicKeyLine / parsePasswd / addAuthorizedKey', () => {
  it('takes the first line of a .pub only if it is one authorized_keys line', () => {
    expect(publicKeyLine(`${KEY}\n`)).to.equal(KEY)
    expect(publicKeyLine('garbage')).to.equal(null)
    expect(publicKeyLine("ssh-ed25519 AAAA'; id #")).to.equal(null)
    expect(publicKeyLine('')).to.equal(null)
  })

  it('reads uid, gid and home from passwd text, rejecting unusable homes', () => {
    const passwd = 'root:x:0:0:root:/root:/bin/sh\nubuntu:x:1000:1001:U:/home/ubuntu:/bin/bash\nbad:x:5:5::/:/bin/sh\nrel:x:6:6::home/x:/bin/sh\n'
    expect(parsePasswd(passwd, 'ubuntu')).to.deep.equal({gid: 1001, home: '/home/ubuntu', uid: 1000})
    expect(parsePasswd(passwd, 'bad')).to.equal(null)
    expect(parsePasswd(passwd, 'rel')).to.equal(null)
    expect(parsePasswd(passwd, 'nobody')).to.equal(null)
  })

  it('appends as its own line, adds the missing newline, and never duplicates', () => {
    expect(addAuthorizedKey('', KEY)).to.deep.equal({added: true, content: `${KEY}\n`})
    expect(addAuthorizedKey(OTHER, KEY)).to.deep.equal({added: true, content: `${OTHER}\n${KEY}\n`})
    expect(addAuthorizedKey(`${OTHER}\n${KEY}\n`, KEY)).to.deep.equal({added: false, content: `${OTHER}\n${KEY}\n`})
  })
})

describe('writeAuthorizedKey / ensureTerminalKey (temporary file system)', () => {
  let dir: string
  const chowned: [string, number, number][] = []
  const chown = (p: string, u: number, g: number) => {
    chowned.push([p, u, g])
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'aoox-key-'))
    chowned.length = 0
  })

  afterEach(() => rmSync(dir, {force: true, recursive: true}))

  it('creates ~/.ssh (700) and authorized_keys (600) when missing', function () {
    if (process.platform === 'win32') this.skip()
    expect(writeAuthorizedKey(dir, KEY, {gid: 7, uid: 5}, chown)).to.equal(true)
    expect(readFileSync(join(dir, '.ssh/authorized_keys'), 'utf8')).to.equal(`${KEY}\n`)
    expect(mode(join(dir, '.ssh'))).to.equal('700')
    expect(mode(join(dir, '.ssh/authorized_keys'))).to.equal('600')
    expect(chowned.map(([, u, g]) => `${u}:${g}`)).to.deep.equal(['5:7', '5:7'])
  })

  it('keeps another key, repairs loose permissions, and is idempotent', function () {
    if (process.platform === 'win32') this.skip()
    mkdirSync(join(dir, '.ssh'), {mode: 0o755})
    writeFileSync(join(dir, '.ssh/authorized_keys'), OTHER, {mode: 0o666})
    expect(writeAuthorizedKey(dir, KEY)).to.equal(true)
    expect(readFileSync(join(dir, '.ssh/authorized_keys'), 'utf8')).to.equal(`${OTHER}\n${KEY}\n`)
    expect(mode(join(dir, '.ssh'))).to.equal('700')
    expect(mode(join(dir, '.ssh/authorized_keys'))).to.equal('600')
    expect(writeAuthorizedKey(dir, KEY)).to.equal(false)
    expect(readFileSync(join(dir, '.ssh/authorized_keys'), 'utf8').split('\n').filter((l) => l === KEY)).to.have.length(1)
  })

  it('refuses to follow a symlinked .ssh', function () {
    if (process.platform === 'win32') this.skip()
    mkdirSync(join(dir, 'elsewhere'))
    symlinkSync(join(dir, 'elsewhere'), join(dir, '.ssh'))
    expect(() => writeAuthorizedKey(dir, KEY)).to.throw(/symlink/)
  })

  it('creates the key dir and pair once, with the api user as owner', function () {
    if (process.platform === 'win32') this.skip()
    const plan = terminalKeyPlan(dir)
    const runs: string[][] = []
    const keygen = (args: string[]) => {
      runs.push(args)
      writeFileSync(plan.privateKey, 'PRIVATE')
      writeFileSync(plan.publicKey, `${KEY}\n`)
    }

    expect(ensureTerminalKey(plan, keygen, chown)).to.equal('created')
    expect(ensureTerminalKey(plan, keygen, chown)).to.equal('exists')
    expect(runs).to.have.length(1)
    expect(mode(plan.secretsDir)).to.equal('700')
    expect(mode(plan.privateKey)).to.equal('600')
    expect(mode(plan.publicKey)).to.equal('644')
    expect(chowned.every(([, u, g]) => u === 1000 && g === 1000)).to.equal(true)
  })

  it('authorizeTerminalKey end to end, and turns failures into a warning instead of throwing', function () {
    if (process.platform === 'win32') this.skip()
    const home = join(dir, 'home-ubuntu')
    mkdirSync(home)
    const plan = terminalKeyPlan(join(dir, 'install'))
    const keygen = () => {
      writeFileSync(plan.privateKey, 'PRIVATE')
      writeFileSync(plan.publicKey, `${KEY}\n`)
    }

    const passwd = `ubuntu:x:1000:1001::${home}:/bin/bash\n`
    const ok = authorizeTerminalKey({chown, installDir: join(dir, 'install'), keygen, passwdText: passwd, user: 'ubuntu'})
    expect(ok).to.deep.equal({message: 'terminal key authorized for ubuntu', ok: true})
    const again = authorizeTerminalKey({chown, installDir: join(dir, 'install'), keygen, passwdText: passwd, user: 'ubuntu'})
    expect(again.message).to.equal('terminal key already authorized for ubuntu')

    const missing = authorizeTerminalKey({chown, installDir: join(dir, 'install'), keygen, passwdText: passwd, user: 'ghost'})
    expect(missing.ok).to.equal(false)
    expect(missing.message).to.contain('Settings > Terminal > authorize')

    const broken = authorizeTerminalKey({
      chown,
      installDir: join(dir, 'install2'),
      keygen() {
        throw new Error('ssh-keygen: command not found')
      },
      passwdText: passwd,
      user: 'ubuntu',
    })
    expect(broken.ok).to.equal(false)
    expect(broken.message).to.contain('ssh-keygen: command not found')
  })
})

})
