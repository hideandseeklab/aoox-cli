/* eslint-disable mocha/max-top-level-suites */
import {expect} from 'chai'

import {dashboardUrlFor, originOf} from '../../src/lib/origin.js'

const stored = {token: 't', url: 'http://api.test:3001', webUrl: 'https://dash.test'}
const never = async () => {
  throw new Error('discover must not be called')
}

describe('dashboardUrlFor', () => {
  it('uses the stored dashboard address for the stored panel', async () => {
    expect(await dashboardUrlFor(stored, 'http://api.test:3001', undefined, never)).to.equal('https://dash.test')
  })

  it('is null for an old login that has no webUrl', async () => {
    expect(await dashboardUrlFor({token: 't', url: 'http://api.test:3001'}, 'http://api.test:3001', undefined, never)).to.equal(null)
  })

  it('is null for a panel that is not the stored one and was not typed', async () => {
    expect(await dashboardUrlFor(stored, 'http://other:3001', undefined, never)).to.equal(null)
  })

  it('--url equal to the stored dashboard or API address needs no lookup', async () => {
    expect(await dashboardUrlFor(stored, stored.url, 'https://dash.test/', never)).to.equal('https://dash.test')
    expect(await dashboardUrlFor(stored, stored.url, 'http://api.test:3001', never)).to.equal('https://dash.test')
  })

  it('--url pointing elsewhere is discovered', async () => {
    const found = await dashboardUrlFor(stored, 'http://x:3001', 'x', async () => ({webUrl: 'http://x:3000'}))
    expect(found).to.equal('http://x:3000')
  })

  it('--url that is an API address gives null', async () => {
    expect(await dashboardUrlFor(null, 'http://x:3001', 'http://x:3001', async () => ({webUrl: null}))).to.equal(null)
  })
})

describe('originOf', () => {
  it('drops the path, trailing slash and a default port', () => {
    expect(originOf('https://dash.test/')).to.equal('https://dash.test')
    expect(originOf('http://localhost:3127')).to.equal('http://localhost:3127')
    expect(originOf('https://dash.test:443/x')).to.equal('https://dash.test')
  })
})
