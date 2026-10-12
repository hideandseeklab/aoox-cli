import {expect} from 'chai'

import {formatEndpoint, resolvePanelAddresses, resolveRegistryIp} from '../../src/lib/panel-addresses.js'

/** Fake fetch answering JSON per exact URL; anything else fails like an unreachable host. */
function fakeFetch(routes: Record<string, unknown>): typeof fetch {
  return (async (input: Parameters<typeof fetch>[0]) => {
    const url = String(input)
    if (!(url in routes)) throw new TypeError('fetch failed')
    return new Response(JSON.stringify(routes[url]), {status: 200})
  }) as typeof fetch
}

const noLookup = async (): Promise<string> => {
  throw new Error('no dns')
}

const IP = '203.0.113.7'
const WEB_DOC = {apiUrl: 'https://api.example.com', version: '0.1.0-alpha.8', webUrl: 'https://dashboard.example.com'}

describe('panel-addresses', () => {
  it('logged in by IP, panel domain set: shows IP and domain for both', async () => {
    const result = await resolvePanelAddresses(
      {url: `http://${IP}:3001`, webUrl: `http://${IP}:3000`},
      fakeFetch({[`http://${IP}:3000/.well-known/aoox.json`]: WEB_DOC}),
      noLookup,
    )
    expect(result).to.deep.equal({
      api: {domain: 'api.example.com', ip: `http://${IP}:3001`},
      dashboard: {domain: 'dashboard.example.com', ip: `http://${IP}:3000`},
      serverIp: IP,
    })
    expect(formatEndpoint(result.dashboard)).to.equal(`http://${IP}:3000 - dashboard.example.com`)
  })

  it('logged in by domain: finds the IP through DNS only when it answers as aoox', async () => {
    const result = await resolvePanelAddresses(
      {url: 'https://api.example.com', webUrl: 'https://dashboard.example.com'},
      fakeFetch({
        [`http://${IP}:3000/.well-known/aoox.json`]: WEB_DOC,
        [`http://${IP}:3001/`]: {description: 'aoox api', version: '0.1.0-alpha.8'},
        'https://dashboard.example.com/.well-known/aoox.json': WEB_DOC,
      }),
      async () => IP,
    )
    expect(formatEndpoint(result.dashboard)).to.equal(`http://${IP}:3000 - dashboard.example.com`)
    expect(formatEndpoint(result.api)).to.equal(`http://${IP}:3001 - api.example.com`)
  })

  it('a CDN or proxy address that does not answer as aoox is not shown', async () => {
    const result = await resolvePanelAddresses(
      {url: 'https://api.example.com', webUrl: 'https://dashboard.example.com'},
      fakeFetch({'https://dashboard.example.com/.well-known/aoox.json': WEB_DOC}),
      async () => '104.16.0.1',
    )
    expect(formatEndpoint(result.dashboard)).to.equal('dashboard.example.com')
    expect(formatEndpoint(result.api)).to.equal('api.example.com')
  })

  it('old login without a dashboard address: finds the dashboard on port 3000 of the API host', async () => {
    const result = await resolvePanelAddresses(
      {url: `http://${IP}:3001`},
      fakeFetch({[`http://${IP}:3000/.well-known/aoox.json`]: WEB_DOC}),
      noLookup,
    )
    expect(formatEndpoint(result.dashboard)).to.equal(`http://${IP}:3000 - dashboard.example.com`)
    expect(formatEndpoint(result.api)).to.equal(`http://${IP}:3001 - api.example.com`)
  })

  it('no panel domain: loopback addresses advertised by the panel are ignored', async () => {
    const result = await resolvePanelAddresses(
      {url: `http://${IP}:3001`, webUrl: `http://${IP}:3000`},
      fakeFetch({
        [`http://${IP}:3000/.well-known/aoox.json`]: {apiUrl: 'http://localhost:3001', webUrl: 'http://localhost:3000'},
      }),
      noLookup,
    )
    expect(formatEndpoint(result.dashboard)).to.equal(`http://${IP}:3000`)
    expect(formatEndpoint(result.api)).to.equal(`http://${IP}:3001`)
  })

  it('panel unreachable: keeps the stored addresses and never throws', async () => {
    const result = await resolvePanelAddresses({url: `http://${IP}:3001`, webUrl: `http://${IP}:3000`}, fakeFetch({}), noLookup)
    expect(formatEndpoint(result.dashboard)).to.equal(`http://${IP}:3000`)
    expect(formatEndpoint(result.api)).to.equal(`http://${IP}:3001`)
  })

  it('registry IP: shown only when the port answers as a Docker registry', async () => {
    const registryFetch = (async (input: Parameters<typeof fetch>[0]) => {
      if (String(input) === `http://${IP}:5000/v2/`) {
        return new Response('{}', {headers: {'docker-distribution-api-version': 'registry/2.0'}, status: 401})
      }

      return new Response('not a registry', {status: 200})
    }) as typeof fetch
    expect(await resolveRegistryIp(IP, 'localhost:5000', registryFetch)).to.equal(`http://${IP}:5000`)
    expect(await resolveRegistryIp(IP, 'localhost:5001', registryFetch)).to.equal(null)
    expect(await resolveRegistryIp(IP, 'registry.example.com', registryFetch)).to.equal(null)
  })

  it('serverIp is reported once the panel answered on it', async () => {
    const result = await resolvePanelAddresses(
      {url: `http://${IP}:3001`, webUrl: `http://${IP}:3000`},
      fakeFetch({[`http://${IP}:3000/.well-known/aoox.json`]: WEB_DOC}),
      noLookup,
    )
    expect(result.serverIp).to.equal(IP)
  })

  it('formatEndpoint returns null when nothing is known', () => {
    expect(formatEndpoint({})).to.equal(null)
  })
})
