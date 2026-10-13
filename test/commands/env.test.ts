/* eslint-disable no-template-curly-in-string */
import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

/**
 * Commands against a fake panel: `fetch` is replaced for the duration of
 * each test, so the request paths and bodies the CLI sends are checked
 * without a server. The URL is given as an API URL that answers
 * `/auth/setup-status` (discovery then accepts it as is).
 */
const URL_ = 'http://panel.test:3001'

interface Call {
  body?: unknown
  method: string
  path: string
}

type Handler = (call: Call) => {body?: unknown; status?: number}

let calls: Call[] = []
let realFetch: typeof fetch
let configHome: string
const savedEnv = {
  FORCE_COLOR: process.env.FORCE_COLOR,
  LOCALAPPDATA: process.env.LOCALAPPDATA,
  NO_COLOR: process.env.NO_COLOR,
  XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
}

function fakePanel(handler: Handler): void {
  globalThis.fetch = (async (input: Request | string | URL, init?: {body?: unknown; method?: string}) => {
    const url = new URL(String(input))
    const call: Call = {
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      method: init?.method ?? 'GET',
      path: url.pathname + url.search,
    }
    if (call.path === '/.well-known/aoox.json') return new Response('not found', {status: 404})
    if (call.path === '/auth/setup-status') return Response.json({needsSetup: false})
    if (call.path === '/auth/me') return Response.json({email: 'dev@example.com', id: 'u1', role: 'member', version: '0.0.1'})
    calls.push(call)
    const {body, status = 200} = handler(call)
    return status === 204 ? new Response(null, {status}) : Response.json(body ?? {}, {status})
  }) as typeof fetch
}

const shared = {
  environments: [
    {id: 'e-dev', keyCount: 1, name: 'development', protected: false, updatedAt: '2026-10-01T00:00:00.000Z', usedByCount: 0},
    {id: 'e-prod', keyCount: 2, name: 'production', protected: true, updatedAt: '2026-10-01T00:00:00.000Z', usedByCount: 1},
  ],
  id: 'set-1',
  name: 'Shared',
  projects: [],
  role: 'developer',
  sharedWithAll: true,
  slug: 'shared',
}
const view = (id: string, name: string, keys: string[]) => ({
  id,
  keys,
  name,
  plainKeys: [],
  protected: name === 'production',
  secretKeys: [],
  updatedAt: '2026-10-01T00:00:00.000Z',
  usedBy: [],
})
const detail = {...shared, environments: [view('e-dev', 'development', ['A']), view('e-prod', 'production', ['A', 'B'])]}
const link = (environmentId: string, environmentName: string, position: number) => ({
  environmentId,
  environmentName,
  keys: [],
  overriddenByOwnEnv: [],
  position,
  protected: false,
  setId: 'set-1',
  setName: 'Shared',
  setSlug: 'shared',
  shadowedKeys: [],
})

const runPanel = () =>
  fakePanel(({path}) => {
    if (path === '/applications/app-1') {
      return {
        body: {
          env: 'C=own\nDB=${{database.main.url}}',
          id: 'app-1',
          name: 'web',
          projectId: 'p1',
          variableSets: [link('e-dev', 'development', 0)],
        },
      }
    }

    if (path === '/variable-sets/set-1/environments/e-dev/reveal') {
      return {body: {keys: [], plainKeys: [], secretKeys: [], updatedAt: '2026-10-01T00:00:00.000Z', variables: 'A=dev\nB=dev'}}
    }

    return {status: 404}
  })

function fakePanelOneSet() {
  fakePanel(({path}) => {
    if (path === '/variable-sets') return {body: [shared]}
    if (path === '/variable-sets/set-1') return {body: detail}
    if (path === '/variable-sets/set-1/environments/e-dev/reveal') {
      return {body: {keys: [], plainKeys: [], secretKeys: [], updatedAt: '2026-10-01T00:00:00.000Z', variables: 'A=dev'}}
    }

    return {status: 404}
  })
}


const base = ['--url', URL_, '--token', 'aoox_test']

describe('aoox env commands (fake panel)', () => {
  beforeEach(() => {
    calls = []
    realFetch = globalThis.fetch
    configHome = mkdtempSync(join(tmpdir(), 'aoox-env-test-'))
    process.env.XDG_CONFIG_HOME = configHome
    process.env.LOCALAPPDATA = configHome
    delete process.env.NO_COLOR
    delete process.env.FORCE_COLOR
  })

  afterEach(() => {
    globalThis.fetch = realFetch
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }

    rmSync(configHome, {force: true, recursive: true})
  })

  it('env set reads, then PUTs the merged text with expectedUpdatedAt and action set', async () => {
    fakePanel(({method, path}) => {
      if (path === '/variable-sets') return {body: [shared]}
      if (path === '/variable-sets/set-1') return {body: detail}
      if (path.endsWith('/reveal')) return {body: {keys: ['A'], plainKeys: [], secretKeys: [], updatedAt: '2026-10-02T00:00:00.000Z', variables: '# c\nA=1'}}
      if (method === 'PUT') return {body: view('e-dev', 'development', ['A', 'B'])}
      return {status: 404}
    })
    const {error, stderr, stdout} = await runCommand(['env:set', 'B=two=2', '--set', 'shared', '--env', 'development', ...base])
    expect(error, stderr).to.equal(undefined)
    const put = calls.find((c) => c.method === 'PUT')!
    expect(put.path).to.equal('/variable-sets/set-1/environments/e-dev')
    expect(put.body).to.deep.equal({action: 'set', expectedUpdatedAt: '2026-10-02T00:00:00.000Z', variables: '# c\nA=1\nB=two=2'})
    expect(stdout).to.contain('shared/development: added B')
  })

  it('env set reports a concurrent change (409) and writes nothing else', async () => {
    fakePanel(({method, path}) => {
      if (path === '/variable-sets') return {body: [shared]}
      if (path === '/variable-sets/set-1') return {body: detail}
      if (path.endsWith('/reveal')) return {body: {keys: [], plainKeys: [], secretKeys: [], updatedAt: '2026-10-02T00:00:00.000Z', variables: ''}}
      if (method === 'PUT') return {body: {message: 'The environment was changed by someone else', statusCode: 409}, status: 409}
      return {status: 404}
    })
    const {error, stderr} = await runCommand(['env:set', 'A=1', '--set', 'shared', '--env', 'development', ...base])
    expect(error?.oclif?.exit).to.equal(1)
    expect(stderr).to.contain('changed by someone else while you were editing it. Nothing was written.')
  })

  it('env set refuses ${{project.…}} before any request', async () => {
    fakePanel(() => ({status: 500}))
    const {error, stderr} = await runCommand(['env:set', 'A=${{project.B}}', '--set', 'shared', '--env', 'development', ...base])
    expect(error?.oclif?.exit).to.equal(1)
    expect(stderr).to.contain('was renamed to')
    expect(calls).to.deep.equal([])
  })

  it('a protected refusal names instance owners and admins', async () => {
    fakePanel(({path}) => {
      if (path === '/variable-sets') return {body: [shared]}
      if (path === '/variable-sets/set-1') return {body: detail}
      if (path.endsWith('/reveal')) return {body: {message: 'This environment is protected', statusCode: 403}, status: 403}
      return {status: 404}
    })
    const {stderr} = await runCommand(['env:pull', '--file', '-', '--set', 'shared', '--env', 'production', ...base])
    expect(stderr).to.contain('"shared/production" is protected; only instance owners and admins can read it.')
  })

  it('env link appends (or inserts at --position) and PUTs the whole ordered list', async () => {
    fakePanel(({body, method, path}) => {
      if (path === '/applications/app-1' && method === 'GET') {
        return {body: {env: '', id: 'app-1', name: 'web', projectId: 'p1', variableSets: [link('e-dev', 'development', 0)]}}
      }

      if (path === '/variable-sets') return {body: [shared]}
      if (path === '/applications/app-1/variable-sets' && method === 'PUT') {
        const {links} = (body as {links: Array<{environmentId: string}>})
        return {body: {links: links.map((l, i) => link(l.environmentId, l.environmentId === 'e-dev' ? 'development' : 'production', i))}}
      }

      return {status: 404}
    })
    const {error, stdout} = await runCommand(['env:link', '--app', 'app-1', '--set', 'shared', '--env', 'production', '--position', '1', ...base])
    expect(error).to.equal(undefined)
    const put = calls.find((c) => c.method === 'PUT')!
    expect(put.body).to.deep.equal({links: [{environmentId: 'e-prod'}, {environmentId: 'e-dev'}]})
    expect(stdout).to.contain('1. shared/production')
    expect(stdout).to.contain('2. shared/development')
  })

  it('env diff takes --from/--to and asks the set diff endpoint', async () => {
    fakePanel(({path}) => {
      if (path === '/variable-sets') return {body: [shared]}
      if (path === '/variable-sets/set-1') return {body: detail}
      if (path.startsWith('/variable-sets/set-1/diff')) {
        return {
          body: {
            comparable: true,
            different: ['A'],
            from: {id: 'e-dev', name: 'development'},
            inBoth: ['A'],
            onlyInFrom: [],
            onlyInTo: ['B'],
            same: [],
            to: {id: 'e-prod', name: 'production'},
          },
        }
      }

      return {status: 404}
    })
    const {stdout} = await runCommand(['env:diff', '--set', 'shared', '--from', 'development', '--to', 'production', ...base])
    expect(calls.map((c) => c.path)).to.include('/variable-sets/set-1/diff?from=development&to=production')
    expect(stdout).to.contain('Only in production (1):')
    expect(stdout).to.contain('Different values (1):')
  })

  it('aoox run merges the linked environments in order, then the own env, and resolves ${{vars.KEY}}', async () => {
    fakePanel(({path}) => {
      if (path === '/applications/app-1') {
        return {
          body: {
            env: 'C=own\nURL=${{vars.HOST}}/x\nDB=${{database.main.url}}',
            id: 'app-1',
            name: 'web',
            projectId: 'p1',
            variableSets: [link('e-prod', 'production', 1), link('e-dev', 'development', 0)],
          },
        }
      }

      if (path === '/variable-sets/set-1/environments/e-dev/reveal') {
        return {body: {keys: [], plainKeys: [], secretKeys: [], updatedAt: '2026-10-01T00:00:00.000Z', variables: 'A=dev\nB=dev\nHOST=dev.local'}}
      }

      if (path === '/variable-sets/set-1/environments/e-prod/reveal') {
        return {body: {keys: [], plainKeys: [], secretKeys: [], updatedAt: '2026-10-01T00:00:00.000Z', variables: 'B=prod\nC=prod\nHOST=prod.local'}}
      }

      return {status: 404}
    })
    const script = join(configHome, 'dump.cjs')
    const out = join(configHome, 'out.json')
    writeFileSync(
      script,
      "const e = process.env; require('fs').writeFileSync(process.argv[2], JSON.stringify({A: e.A, B: e.B, C: e.C, DB: e.DB, URL: e.URL}))",
    )
    const {error, stderr} = await runCommand(['run', '--app', 'app-1', ...base, '--', 'node', script, out])
    expect(error, stderr).to.equal(undefined)
    expect(JSON.parse(readFileSync(out, 'utf8'))).to.deep.equal({
      A: 'dev',
      B: 'prod',
      C: 'own',
      DB: '${{database.main.url}}',
      URL: 'prod.local/x',
    })
    // Reveals happen in link order.
    expect(calls.filter((c) => c.path.endsWith('/reveal')).map((c) => c.path)).to.deep.equal([
      '/variable-sets/set-1/environments/e-dev/reveal',
      '/variable-sets/set-1/environments/e-prod/reveal',
    ])
    expect(stderr).to.contain('Left as written')
    expect(stderr).to.contain('DB')
  })

  describe('aoox run banner', () => {
    const child = ['--', 'node', '-e', '0']

    it('prints a counted plain banner (own env overriding counts once, DB counts as injected)', async () => {
      runPanel()
      const {error, stderr} = await runCommand(['run', '--app', 'app-1', ...base, ...child], undefined, {stripAnsi: false})
      expect(error, stderr).to.equal(undefined)
      // A, B from the set; C, DB from the own env.
      expect(stderr).to.contain(
        'aoox  Injecting 4 variables into your process · Application "web": shared/development < own env',
      )
      expect(stderr).to.contain('warn  Left as written')
      expect(stderr).to.not.contain('\u001B')
    })

    it('counts --file and says "1 variable"', async () => {
      runPanel()
      const file = join(configHome, 'extra.env')
      writeFileSync(file, 'A=file\nZ=file\n')
      const {stderr} = await runCommand(['run', '--app', 'app-1', ...base, '--file', file, ...child])
      expect(stderr).to.contain('Injecting 5 variables')
      fakePanelOneSet()
      const one = await runCommand(['run', '--set', 'shared', '--env', 'development', ...base, ...child])
      expect(one.stderr).to.contain('aoox  Injecting 1 variable from shared/development (no links, no own env)')
    })

    it('FORCE_COLOR adds codes, NO_COLOR removes them', async () => {
      runPanel()
      process.env.FORCE_COLOR = '1'
      const forced = await runCommand(['run', '--app', 'app-1', ...base, ...child], undefined, {stripAnsi: false})
      expect(forced.stderr).to.contain('\u001B[')
      expect(forced.stderr).to.contain('\u001B[33mwarn\u001B[39m')
      process.env.NO_COLOR = '1'
      const off = await runCommand(['run', '--app', 'app-1', ...base, ...child], undefined, {stripAnsi: false})
      expect(off.stderr).to.not.contain('\u001B')
      expect(off.stderr).to.contain('Injecting 4 variables')
    })

    it('--quiet hides the banner but keeps the warnings', async () => {
      runPanel()
      const {stderr} = await runCommand(['run', '--quiet', '--app', 'app-1', ...base, ...child])
      expect(stderr).to.not.contain('Injecting')
      expect(stderr).to.contain('warn  Left as written')
    })
  })
})
