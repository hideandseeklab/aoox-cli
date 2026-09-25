import {expect} from 'chai'

import {MissingCredentialsError, normalizeUrl, resolveCredentials} from '../../src/lib/config.js'

describe('config lib', () => {
  describe('normalizeUrl', () => {
    it('drops trailing slashes and surrounding space', () => {
      expect(normalizeUrl(' https://panel.test/// ')).to.equal('https://panel.test')
      expect(normalizeUrl('http://localhost:3001')).to.equal('http://localhost:3001')
    })
  })

  describe('resolveCredentials', () => {
    const file = {token: 'aoox_stored', url: 'https://panel.test'}

    it('uses the stored config when nothing is passed', () => {
      expect(resolveCredentials({file})).to.deep.equal(file)
    })

    it('lets flags and environment win per field', () => {
      expect(resolveCredentials({file, token: 'aoox_flag'})).to.deep.equal({
        token: 'aoox_flag',
        url: 'https://panel.test',
      })
    })

    it('reuses the stored token when the url points at the same panel', () => {
      expect(resolveCredentials({file, url: 'https://panel.test/'})).to.deep.equal(file)
    })

    it('refuses to send the stored token to a different panel', () => {
      expect(() => resolveCredentials({file, url: 'https://evil.test'})).to.throw(
        MissingCredentialsError,
        /Tidak ada token untuk https:\/\/evil.test/,
      )
    })

    it('still accepts a different panel when a token comes with it', () => {
      expect(resolveCredentials({file, token: 'aoox_other', url: 'https://evil.test'})).to.deep.equal({
        token: 'aoox_other',
        url: 'https://evil.test',
      })
    })

    it('asks for login when there is nothing at all', () => {
      expect(() => resolveCredentials({file: null})).to.throw(MissingCredentialsError, /URL panel/)
      expect(() => resolveCredentials({file: null, url: 'https://panel.test'})).to.throw(
        MissingCredentialsError,
        /API token/,
      )
    })
  })
})
