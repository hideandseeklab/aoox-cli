import {expect} from 'chai'

import {ApiError} from '../../src/lib/api.js'
import {formatConnection, shortReason} from '../../src/lib/connection-summary.js'

const cfg = {url: 'https://api.example.com', webUrl: 'https://dashboard.example.com'}

describe('connection-summary', () => {
  it('not logged in', () => {
    expect(formatConnection({config: null, registry: null})).to.deep.equal(['Not connected — run: aoox login'])
  })

  it('logged in with a registry', () => {
    const lines = formatConnection({
      config: cfg,
      registry: {kind: 'found', registry: {type: 'self-hosted', url: 'registry.example.com'}},
    })
    expect(lines).to.deep.equal([
      'Connected to',
      '  Dashboard  https://dashboard.example.com',
      '  API        https://api.example.com',
      '  Registry   registry.example.com (self-hosted)',
    ])
  })

  it('does not show the API url as the dashboard when no webUrl is stored', () => {
    const lines = formatConnection({config: {url: 'http://1.2.3.4:3001'}, registry: null})
    expect(lines).to.deep.equal([
      'Connected to',
      '  Dashboard  unknown (sign in again with the dashboard address: aoox login)',
      '  API        http://1.2.3.4:3001',
    ])
  })

  it('shows IP and panel domain when they are known', () => {
    const lines = formatConnection({
      config: {url: 'http://203.0.113.7:3001', webUrl: 'http://203.0.113.7:3000'},
      panel: {
        api: {domain: 'api.example.com', ip: 'http://203.0.113.7:3001'},
        dashboard: {domain: 'dashboard.example.com', ip: 'http://203.0.113.7:3000'},
      },
      registry: null,
    })
    expect(lines).to.deep.equal([
      'Connected to',
      '  Dashboard  http://203.0.113.7:3000 - dashboard.example.com',
      '  API        http://203.0.113.7:3001 - api.example.com',
    ])
  })

  it('shows the registry IP and its domain', () => {
    const lines = formatConnection({
      config: cfg,
      registry: {ip: 'http://203.0.113.7:5000', kind: 'found', registry: {type: 'self-hosted', url: 'registry.example.com'}},
    })
    expect(lines.at(-1)).to.equal('  Registry   http://203.0.113.7:5000 - registry.example.com (self-hosted)')
  })

  it('registry lookup failed', () => {
    const lines = formatConnection({config: cfg, registry: {kind: 'error', reason: 'panel unreachable'}})
    expect(lines.at(-1)).to.equal('  Registry   (could not check: panel unreachable)')
  })

  it('warns about a localhost registry', () => {
    const lines = formatConnection({
      config: cfg,
      registry: {kind: 'found', registry: {type: 'self-hosted', url: 'localhost:5000'}},
    })
    expect(lines.at(-1)).to.equal(
      '  Registry   localhost:5000 (self-hosted) (only reachable on the server — set a domain: aoox registry domain --set <host>)',
    )
  })

  it('shortReason keeps it short and token-free', () => {
    expect(shortReason(new ApiError(401, 'x'))).to.equal('token no longer valid')
    expect(shortReason(new ApiError(0, 'x'))).to.equal('panel unreachable')
    expect(shortReason(new Error('a'.repeat(100)))).to.have.length(60)
  })
})
