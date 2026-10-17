import {expect} from 'chai'
import {mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {MissingCredentialsError, normalizeUrl, readConfig, resolveCredentials} from '../../src/lib/config.js'

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
        /No token for https:\/\/evil.test/,
      )
    })

    it('still accepts a different panel when a token comes with it', () => {
      expect(resolveCredentials({file, token: 'aoox_other', url: 'https://evil.test'})).to.deep.equal({
        token: 'aoox_other',
        url: 'https://evil.test',
      })
    })

    it('asks for login when there is nothing at all', () => {
      expect(() => resolveCredentials({file: null})).to.throw(MissingCredentialsError, /panel URL/)
      expect(() => resolveCredentials({file: null, url: 'https://panel.test'})).to.throw(
        MissingCredentialsError,
        /API token/,
      )
    })
  })

  describe('readConfig', () => {
    it('reads an old file (API url only) and a new one with webUrl', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'aoox-cfg-'))
      try {
        await writeFile(join(dir, 'config.json'), JSON.stringify({token: 'aoox_a', url: 'http://localhost:3001/'}))
        expect(await readConfig(dir)).to.deep.equal({token: 'aoox_a', url: 'http://localhost:3001'})
        await writeFile(
          join(dir, 'config.json'),
          JSON.stringify({token: 'aoox_a', url: 'https://api.x.test', webUrl: 'https://x.test/'}),
        )
        expect(await readConfig(dir)).to.deep.equal({token: 'aoox_a', url: 'https://api.x.test', webUrl: 'https://x.test'})
      } finally {
        await rm(dir, {force: true, recursive: true})
      }
    })
  })
})
