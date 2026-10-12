import {expect} from 'chai'

import {
  manifestExists,
  manifestExistsAnywhere,
  parseBearerChallenge,
  registryBaseUrls,
  RegistryCheckError,
} from '../../src/lib/registry-check.js'

interface Call {
  auth?: string
  method?: string
  url: string
}

function fake(handler: (url: string, auth: string | undefined) => Response): {calls: Call[]; fn: typeof fetch} {
  const calls: Call[] = []
  const fn = (async (input: string | URL, init?: Parameters<typeof fetch>[1]) => {
    const headers = (init?.headers ?? {}) as Record<string, string>
    calls.push({auth: headers.authorization, method: init?.method, url: String(input)})
    return handler(String(input), headers.authorization)
  }) as unknown as typeof fetch
  return {calls, fn}
}

async function failure(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise
  } catch (error) {
    return error as Error
  }

  throw new Error('expected a rejection')
}

describe('registry-check', () => {
  it('parses a bearer challenge', () => {
    expect(parseBearerChallenge('Bearer realm="https://a/token",service="reg",scope="repository:x:pull"')).to.deep.equal({
      realm: 'https://a/token',
      scope: 'repository:x:pull',
      service: 'reg',
    })
    expect(parseBearerChallenge('Basic realm="x"')).to.equal(null)
    expect(parseBearerChallenge(null)).to.equal(null)
  })

  it('200 = exists, 404 = missing, with Basic auth and HEAD', async () => {
    const f = fake((url) => new Response(null, {status: url.includes('/exists/') ? 200 : 404}))
    expect(
      await manifestExists({baseUrl: 'http://r', fetchFn: f.fn, password: 'p', repo: 'exists/app', tag: '1', username: 'u'}),
    ).to.equal(true)
    expect(await manifestExists({baseUrl: 'http://r', fetchFn: f.fn, repo: 'gone/app', tag: '1'})).to.equal(false)
    expect(f.calls[0].method).to.equal('HEAD')
    expect(f.calls[0].url).to.equal('http://r/v2/exists/app/manifests/1')
    expect(f.calls[0].auth).to.equal(`Basic ${Buffer.from('u:p').toString('base64')}`)
    expect(f.calls[1].auth).to.equal(undefined)
  })

  it('follows 401 -> token -> retry with Bearer', async () => {
    const f = fake((url, auth) => {
      if (url.startsWith('https://auth/token')) return new Response(JSON.stringify({token: 'T'}))
      if (auth === 'Bearer T') return new Response(null, {status: 200})
      return new Response(null, {
        headers: {'www-authenticate': 'Bearer realm="https://auth/token",service="reg",scope="repository:app:pull"'},
        status: 401,
      })
    })
    expect(
      await manifestExists({baseUrl: 'https://r', fetchFn: f.fn, password: 'p', repo: 'app', tag: '1', username: 'u'}),
    ).to.equal(true)
    const tokenCall = f.calls.find((c) => c.url.startsWith('https://auth/token'))!
    expect(tokenCall.url).to.contain('service=reg').and.contain('scope=repository%3Aapp%3Apull')
    expect(tokenCall.auth).to.contain('Basic')
    expect(f.calls.at(-1)!.auth).to.equal('Bearer T')
  })

  it('401 without a bearer challenge, or still 401 after the retry, is an error', async () => {
    const basic = fake(() => new Response(null, {headers: {'www-authenticate': 'Basic realm="x"'}, status: 401}))
    const err = await failure(manifestExists({baseUrl: 'http://r', fetchFn: basic.fn, repo: 'a', tag: '1'}))
    expect(err).to.be.instanceOf(RegistryCheckError)
    expect(err.message).to.contain('rejected the credentials')

    const loop = fake((url) =>
      url.startsWith('https://auth/')
        ? new Response('{"access_token":"T"}')
        : new Response(null, {headers: {'www-authenticate': 'Bearer realm="https://auth/t"'}, status: 401}),
    )
    expect(await failure(manifestExists({baseUrl: 'https://r', fetchFn: loop.fn, repo: 'a', tag: '1'}))).to.be.instanceOf(
      RegistryCheckError,
    )
  })

  it('unexpected status is an error', async () => {
    const f = fake(() => new Response(null, {status: 500}))
    const err = await failure(manifestExists({baseUrl: 'http://r', fetchFn: f.fn, repo: 'a', tag: '1'}))
    expect(err.message).to.contain('500')
  })

  it('manifestExistsAnywhere reports an unreachable registry', async () => {
    const original = globalThis.fetch
    globalThis.fetch = (async () => {
      throw new TypeError('fetch failed', {cause: new Error('ECONNREFUSED')})
    }) as unknown as typeof fetch
    try {
      const err = await failure(manifestExistsAnywhere(['http://a', 'https://a'], {repo: 'x', tag: '1'}))
      expect(err.message).to.contain('could not reach the registry at http://a (ECONNREFUSED)')
    } finally {
      globalThis.fetch = original
    }
  })

  describe('registryBaseUrls', () => {
    it('mirrors the API scheme rules', () => {
      expect(registryBaseUrls({domain: null, type: 'self-hosted', url: 'localhost:5000'})).to.deep.equal([
        'http://localhost:5000',
        'https://localhost:5000',
      ])
      expect(registryBaseUrls({domain: null, type: 'self-hosted', url: 'reg.example.com:5000'})).to.deep.equal([
        'http://reg.example.com:5000',
      ])
      expect(registryBaseUrls({domain: 'reg.example.com', type: 'self-hosted', url: 'reg.example.com'})).to.deep.equal([
        'https://reg.example.com',
      ])
      expect(registryBaseUrls({domain: null, type: 'external', url: 'ghcr.io'})).to.deep.equal(['https://ghcr.io'])
      expect(registryBaseUrls({domain: null, type: 'external', url: 'http://localhost:5099/'})).to.deep.equal([
        'http://localhost:5099',
      ])
    })
  })
})
