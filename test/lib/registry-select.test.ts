import {expect} from 'chai'

import type {Registry} from '../../src/lib/types.js'

import {chooseRegistry, localhostRegistryHint} from '../../src/lib/registry-select.js'

const reg = (id: string, type: Registry['type'], url: string): Registry => ({
  domain: null,
  id,
  imagePrefix: null,
  name: id,
  type,
  url,
  username: null,
})

describe('registry-select', () => {
  const self = reg('s', 'self-hosted', 'reg.example.com')
  const ext = reg('e', 'external', 'ghcr.io')

  it('prefers the self-hosted registry, then explicit id, then host match', () => {
    expect(chooseRegistry([ext, self])).to.deep.equal({kind: 'found', registry: self})
    expect(chooseRegistry([ext, self], 'e')).to.deep.equal({kind: 'found', registry: ext})
    expect(chooseRegistry([ext, self], undefined, 'ghcr.io')).to.deep.equal({kind: 'found', registry: ext})
  })

  it('errors and ambiguity', () => {
    expect(chooseRegistry([]).kind).to.equal('error')
    expect(chooseRegistry([ext], 'zzz').kind).to.equal('error')
    expect(chooseRegistry([ext, reg('f', 'external', 'x.io')]).kind).to.equal('ambiguous')
    expect(chooseRegistry([ext])).to.deep.equal({kind: 'found', registry: ext})
  })

  it('warns about a localhost registry only when the panel is remote', () => {
    expect(localhostRegistryHint('localhost:5000', 'https://panel.example.com')).to.contain(
      'aoox registry domain --set <host>',
    )
    expect(localhostRegistryHint('localhost:5000', 'http://localhost:3001')).to.equal(null)
    expect(localhostRegistryHint('reg.example.com', 'https://panel.example.com')).to.equal(null)
  })
})
