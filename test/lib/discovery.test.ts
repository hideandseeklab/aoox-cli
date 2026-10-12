import {expect} from 'chai'

import {
  candidateUrls,
  classifyFetchError,
  discover,
  DiscoveryError,
  explainFailure,
  isLoopbackHost,
  parseDiscovery,
} from '../../src/lib/discovery.js'
import {resolveApiUrl} from '../../src/lib/flags.js'

type Routes = Record<string, (() => Response) | Error>

/** A fake fetch keyed by full URL; unknown URLs act like a refused connection. */
function fakeFetch(routes: Routes, seen: string[] = []): typeof fetch {
  return (async (input: Parameters<typeof fetch>[0]) => {
    const url = String(input)
    seen.push(url)
    const route = routes[url]
    if (!route) throw Object.assign(new TypeError('fetch failed'), {cause: {code: 'ECONNREFUSED'}})
    if (route instanceof Error) throw route
    return route()
  }) as typeof fetch
}

const json = (body: unknown, status = 200) => () =>
  new Response(JSON.stringify(body), {headers: {'content-type': 'application/json'}, status})
const html = (status = 200) => () => new Response('<html></html>', {status})

const wrongVersion = Object.assign(new TypeError('fetch failed'), {
  cause: {code: 'ERR_SSL_WRONG_VERSION_NUMBER', message: 'error:0A00010B:SSL routines:wrong version number'},
})

describe('discovery lib', () => {
  describe('candidateUrls', () => {
    it('keeps a full URL as is, without the trailing slash', () => {
      expect(candidateUrls('https://dashboard.example.com/')).to.deep.equal(['https://dashboard.example.com'])
      expect(candidateUrls(' http://panel.test:8080// ')).to.deep.equal(['http://panel.test:8080'])
    })

    it('tries https then http for a bare hostname', () => {
      expect(candidateUrls('dashboard.example.com')).to.deep.equal([
        'https://dashboard.example.com',
        'http://dashboard.example.com',
      ])
    })

    it('tries https then http for a bare host with a port', () => {
      expect(candidateUrls('43.157.197.32:3000')).to.deep.equal(['https://43.157.197.32:3000', 'http://43.157.197.32:3000'])
    })

    it('also tries the default dashboard port for a bare IP', () => {
      expect(candidateUrls('43.157.197.32')).to.deep.equal([
        'https://43.157.197.32',
        'http://43.157.197.32',
        'http://43.157.197.32:3000',
      ])
    })

    it('adds :3000 for an IP even when a scheme is given', () => {
      expect(candidateUrls('http://10.0.0.5')).to.deep.equal(['http://10.0.0.5', 'http://10.0.0.5:3000'])
    })

    it('does not add :3000 when a hostname is not an IP', () => {
      expect(candidateUrls('https://panel.test')).to.deep.equal(['https://panel.test'])
    })

    it('rejects empty input, spaces and other schemes', () => {
      expect(() => candidateUrls('')).to.throw(DiscoveryError)
      expect(() => candidateUrls('my panel')).to.throw(DiscoveryError)
      expect(() => candidateUrls('ftp://panel.test')).to.throw(/http:\/\/ and https:\/\//)
    })
  })

  describe('parseDiscovery', () => {
    it('reads apiUrl, webUrl and version', () => {
      expect(parseDiscovery({apiUrl: 'https://api.test/', version: '1.2.3', webUrl: 'https://web.test'})).to.deep.equal({
        apiUrl: 'https://api.test',
        version: '1.2.3',
        webUrl: 'https://web.test',
      })
    })

    it('rejects a document without a usable apiUrl', () => {
      expect(parseDiscovery({})).to.equal(null)
      expect(parseDiscovery({apiUrl: 'nope'})).to.equal(null)
      expect(parseDiscovery({apiUrl: 'ftp://x.test'})).to.equal(null)
      expect(parseDiscovery('text')).to.equal(null)
    })
  })

  describe('classifyFetchError', () => {
    it('detects HTTPS spoken to a plain HTTP port', () => {
      expect(classifyFetchError(wrongVersion, 'https://1.2.3.4:3001')).to.equal('plain-http')
      expect(classifyFetchError(wrongVersion, 'http://1.2.3.4:3001')).to.equal('unreachable')
    })

    it('detects a plain HTTP server that drops the TLS handshake', () => {
      const reset = Object.assign(new TypeError('fetch failed'), {
        cause: {code: 'ECONNRESET', message: 'Client network socket disconnected before secure TLS connection was established'},
      })
      expect(classifyFetchError(reset, 'https://43.157.197.32:3001')).to.equal('plain-http')
      expect(classifyFetchError(reset, 'http://43.157.197.32:3001')).to.equal('unreachable')
    })

    it('detects timeouts, certificate problems and refused connections', () => {
      expect(classifyFetchError(Object.assign(new Error('x'), {name: 'TimeoutError'}), 'http://a')).to.equal('timeout')
      expect(
        classifyFetchError(Object.assign(new TypeError('fetch failed'), {cause: {code: 'CERT_HAS_EXPIRED'}}), 'https://a'),
      ).to.equal('tls')
      expect(
        classifyFetchError(Object.assign(new TypeError('fetch failed'), {cause: {code: 'ENOTFOUND'}}), 'https://a'),
      ).to.equal('unreachable')
    })
  })

  describe('explainFailure', () => {
    it('suggests the http:// address for a plain HTTP port', () => {
      expect(explainFailure('plain-http', 'https://1.2.3.4:3000')).to.contain('Try http://1.2.3.4:3000')
    })

    it('points to the firewall and the panel domain when unreachable', () => {
      const text = explainFailure('unreachable', 'http://1.2.3.4:3000')
      expect(text).to.contain('firewall')
      expect(text).to.contain('Infrastructure → Panel domain')
    })
  })

  describe('isLoopbackHost', () => {
    it('knows loopback names', () => {
      for (const h of ['localhost', '127.0.0.1', '[::1]', '::1']) expect(isLoopbackHost(h)).to.equal(true)
      expect(isLoopbackHost('203.0.113.10')).to.equal(false)
    })
  })

  describe('discover', () => {
    const doc = {apiUrl: 'https://api.panel.test', version: '0.1.0-alpha.8', webUrl: 'https://panel.test'}

    it('follows the discovery file of the dashboard', async () => {
      const found = await discover('https://panel.test', fakeFetch({'https://panel.test/.well-known/aoox.json': json(doc)}))
      expect(found).to.deep.include({apiUrl: 'https://api.panel.test', version: '0.1.0-alpha.8', webUrl: 'https://panel.test'})
      expect(found.notes).to.deep.equal([])
    })

    it('falls back from https to http for a bare IP and finds the dashboard on :3000', async () => {
      const seen: string[] = []
      const found = await discover(
        '43.157.197.32',
        fakeFetch(
          {'http://43.157.197.32:3000/.well-known/aoox.json': json({apiUrl: 'http://43.157.197.32:3001'})},
          seen,
        ),
      )
      expect(found.apiUrl).to.equal('http://43.157.197.32:3001')
      expect(found.webUrl).to.equal('http://43.157.197.32:3000')
      expect(seen[0]).to.equal('https://43.157.197.32/.well-known/aoox.json')
    })

    it('replaces a localhost API URL with <host>:3001 when the dashboard was reached on a real host', async () => {
      const found = await discover(
        'https://203.0.113.10',
        fakeFetch({'https://203.0.113.10/.well-known/aoox.json': json({apiUrl: 'http://localhost:3001'})}),
      )
      expect(found.apiUrl).to.equal('http://203.0.113.10:3001')
      expect(found.notes[0]).to.contain('did not advertise a public API address')
    })

    it('keeps a localhost API URL when the dashboard itself is on localhost', async () => {
      const found = await discover(
        'http://localhost:3000',
        fakeFetch({'http://localhost:3000/.well-known/aoox.json': json({apiUrl: 'http://localhost:3001'})}),
      )
      expect(found.apiUrl).to.equal('http://localhost:3001')
      expect(found.notes).to.deep.equal([])
    })

    it('accepts an API URL from an older script and says so', async () => {
      const found = await discover(
        'http://api.panel.test',
        fakeFetch({
          'http://api.panel.test/.well-known/aoox.json': json({message: 'Not Found'}, 404),
          'http://api.panel.test/auth/setup-status': json({needsSetup: false}),
        }),
      )
      expect(found.apiUrl).to.equal('http://api.panel.test')
      expect(found.webUrl).to.equal(null)
      expect(found.notes[0]).to.contain('API address, not the dashboard')
    })

    it('reports an address that is not aoox', async () => {
      try {
        await discover(
          'https://example.org',
          fakeFetch({
            'https://example.org/.well-known/aoox.json': html(404),
            'https://example.org/auth/setup-status': html(404),
          }),
        )
        expect.fail('should have thrown')
      } catch (error) {
        expect((error as DiscoveryError).failure).to.equal('not-aoox')
      }
    })

    it('explains plain HTTP when https was forced', async () => {
      try {
        await discover('https://43.157.197.32:3001', fakeFetch({'https://43.157.197.32:3001/.well-known/aoox.json': wrongVersion}))
        expect.fail('should have thrown')
      } catch (error) {
        expect((error as Error).message).to.contain('plain HTTP')
        expect((error as Error).message).to.contain('http://43.157.197.32:3001')
      }
    })

    it('explains an unreachable host', async () => {
      try {
        await discover('http://10.255.255.1:3000', fakeFetch({}))
        expect.fail('should have thrown')
      } catch (error) {
        expect((error as DiscoveryError).failure).to.equal('unreachable')
        expect((error as Error).message).to.contain('Could not reach http://10.255.255.1:3000')
      }
    })
  })

  describe('resolveApiUrl', () => {
    const file = {token: 'aoox_x', url: 'https://api.panel.test', webUrl: 'https://panel.test'}

    it('maps the stored dashboard or API address to the stored API URL without a network call', async () => {
      expect(await resolveApiUrl(file, 'https://panel.test/')).to.equal('https://api.panel.test')
      expect(await resolveApiUrl(file, 'https://api.panel.test')).to.equal('https://api.panel.test')
    })

    it('treats a legacy file (API URL only) as matching its URL', async () => {
      expect(await resolveApiUrl({token: 'aoox_x', url: 'http://localhost:3001'}, 'http://localhost:3001/')).to.equal(
        'http://localhost:3001',
      )
    })
  })
})
