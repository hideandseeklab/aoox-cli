import {expect} from 'chai'

import {describeNetworkError, discover} from '../../src/lib/discovery.js'

const cause = (code: string) => Object.assign(new TypeError('fetch failed'), {cause: {code}})
const url = 'https://panel.test'

describe('TLS error messages', () => {
  for (const code of ['UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'SELF_SIGNED_CERT_IN_CHAIN']) {
    it(`names the issuer for ${code}`, async () => {
      const text = await describeNetworkError(url, cause(code), async () => 'AVG Web/Mail Shield Root')
      expect(text).to.contain('Could not verify https://panel.test')
      expect(text).to.contain('issued by "AVG Web/Mail Shield Root", which Node does not trust')
      expect(text).to.contain('antivirus or proxy')
      expect(text).to.contain('NODE_EXTRA_CA_CERTS')
      expect(text).to.contain('NODE_OPTIONS=--use-system-ca')
      expect(text).to.contain('panel.test to the antivirus')
    })
  }

  it('still explains when the issuer cannot be read', async () => {
    for (const lookup of [async () => null, async () => {
          throw new Error('boom')
        }]) {
      // eslint-disable-next-line no-await-in-loop
      const text = await describeNetworkError(url, cause('UNABLE_TO_GET_ISSUER_CERT_LOCALLY'), lookup)
      expect(text).to.contain('signed by an authority Node does not trust')
      expect(text).to.not.contain('issued by "')
    }
  })

  for (const code of ['CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'ERR_TLS_CERT_ALTNAME_INVALID']) {
    it(`keeps the old wording and skips the lookup for ${code}`, async () => {
      let called = false
      const text = await describeNetworkError(url, cause(code), async () => {
        called = true
        return 'x'
      })
      expect(called).to.equal(false)
      expect(text).to.contain('is not trusted (expired, self-signed or issued for another name)')
    })
  }

  it('does not look up an issuer for non-certificate failures', async () => {
    let called = false
    const text = await describeNetworkError(url, cause('ECONNREFUSED'), async () => {
      called = true
      return 'x'
    })
    expect(called).to.equal(false)
    expect(text).to.contain('Could not reach https://panel.test')
  })

  it('reaches the user through discover()', async () => {
    const failing = (async () => {
      throw cause('UNABLE_TO_GET_ISSUER_CERT_LOCALLY')
    }) as unknown as typeof fetch
    // The default lookup connects to panel.invalid, fails, and yields no issuer name.
    try {
      await discover('https://panel.invalid', failing)
      expect.fail('should throw')
    } catch (error) {
      expect((error as Error).message).to.contain('Could not verify https://panel.invalid')
    }
  })
})
