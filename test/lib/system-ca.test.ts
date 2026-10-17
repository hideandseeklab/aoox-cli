import {expect} from 'chai'

import {applySystemCa, type CaApi, systemCaDisabled} from '../../src/lib/system-ca.js'

function fakeApi(defaults: string[], system: string[]) {
  const calls: string[][] = []
  const api: CaApi = {
    getCACertificates: (type) => (type === 'system' ? system : defaults),
    setDefaultCACertificates(certs) {
      calls.push(certs)
    },
  }
  return {api, calls}
}

describe('system CA', () => {
  it('merges the default and system lists without duplicates', () => {
    const {api, calls} = fakeApi(['a', 'b'], ['b', 'c'])
    expect(applySystemCa({}, api)).to.equal('applied')
    expect(calls).to.deep.equal([['a', 'b', 'c']])
  })

  it('does nothing when AOOX_SYSTEM_CA is 0 or false', () => {
    for (const value of ['0', 'false', ' FALSE ']) {
      const {api, calls} = fakeApi(['a'], ['b'])
      expect(applySystemCa({AOOX_SYSTEM_CA: value}, api)).to.equal('disabled')
      expect(calls).to.have.length(0)
    }

    expect(systemCaDisabled({AOOX_SYSTEM_CA: '1'})).to.equal(false)
    expect(systemCaDisabled({})).to.equal(false)
  })

  it('is a silent no-op on a Node without the APIs', () => {
    expect(applySystemCa({}, {})).to.equal('unsupported')
    expect(applySystemCa({}, {getCACertificates: () => []})).to.equal('unsupported')
  })

  it('falls back silently when loading the system store throws', () => {
    const calls: string[][] = []
    const api: CaApi = {
      getCACertificates(type) {
        if (type === 'system') throw new Error('store unavailable')
        return ['a']
      },
      setDefaultCACertificates: (c) => calls.push(c) && undefined,
    }
    expect(applySystemCa({}, api)).to.equal('failed')
    expect(calls).to.have.length(0)
  })

  it('falls back silently when setting the list throws', () => {
    const api: CaApi = {
      getCACertificates: () => ['a'],
      setDefaultCACertificates() {
        throw new Error('bad pem')
      },
    }
    expect(applySystemCa({}, api)).to.equal('failed')
  })
})
