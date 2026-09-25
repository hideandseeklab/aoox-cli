import {expect} from 'chai'

import {isIpv4} from '../../src/lib/system.js'

describe('isIpv4', () => {
  it('accepts a plain dotted quad', () => {
    expect(isIpv4('203.0.113.10')).to.be.true
    expect(isIpv4('  203.0.113.10\n')).to.be.true
  })

  it('rejects anything that is not a bare IPv4 address', () => {
    expect(isIpv4('')).to.be.false
    expect(isIpv4('<html>not found</html>')).to.be.false
    expect(isIpv4('::1')).to.be.false
  })
})
