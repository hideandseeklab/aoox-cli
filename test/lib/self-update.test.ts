import {expect} from 'chai'

import {channelOf, detectInstallMethod, fetchPackument, pickNewest} from '../../src/lib/self-update.js'

const doc = (tags: Record<string, string>, versions: string[], deprecated: string[] = []) => ({
  'dist-tags': tags,
  versions: Object.fromEntries(versions.map((v) => [v, deprecated.includes(v) ? {deprecated: 'x'} : {}])),
})

describe('self-update', () => {
  describe('pickNewest', () => {
    const d = doc({alpha: '0.1.0-alpha.7', latest: '0.1.0-alpha.5'}, ['0.1.0-alpha.5', '0.1.0-alpha.7'])

    it('pre-release install follows the newest of latest and its channel', () => {
      expect(pickNewest(d, '0.1.0-alpha.4')).to.equal('0.1.0-alpha.7')
      expect(pickNewest(d, '0.1.0-alpha.6')).to.equal('0.1.0-alpha.7')
    })

    it('returns null when already newest or ahead', () => {
      expect(pickNewest(d, '0.1.0-alpha.7')).to.equal(null)
      expect(pickNewest(d, '0.1.0-alpha.10')).to.equal(null)
    })

    it('compares alpha.10 above alpha.9', () => {
      const x = doc({latest: '0.1.0-alpha.10'}, ['0.1.0-alpha.10'])
      expect(pickNewest(x, '0.1.0-alpha.9')).to.equal('0.1.0-alpha.10')
    })

    it('a stable install never moves to a pre-release', () => {
      expect(pickNewest(d, '0.0.9')).to.equal(null)
      const s = doc({alpha: '1.1.0-alpha.1', latest: '1.0.1'}, ['1.0.1', '1.1.0-alpha.1'])
      expect(pickNewest(s, '1.0.0')).to.equal('1.0.1')
    })

    it('a pre-release install moves to a newer stable', () => {
      const s = doc({alpha: '0.1.0-alpha.7', latest: '0.1.0'}, ['0.1.0', '0.1.0-alpha.7'])
      expect(pickNewest(s, '0.1.0-alpha.7')).to.equal('0.1.0')
    })

    it('skips deprecated and unlisted versions', () => {
      const x = doc({latest: '0.1.0-alpha.9'}, ['0.1.0-alpha.9'], ['0.1.0-alpha.9'])
      expect(pickNewest(x, '0.1.0-alpha.7')).to.equal(null)
      expect(pickNewest(doc({latest: '9.9.9'}, []), '1.0.0')).to.equal(null)
    })

    it('copes with an empty document', () => {
      expect(pickNewest({}, '1.0.0')).to.equal(null)
    })
  })

  it('channelOf', () => {
    expect(channelOf('0.1.0-alpha.7')).to.equal('alpha')
    expect(channelOf('1.0.0')).to.equal(null)
  })

  describe('detectInstallMethod', () => {
    it('npm global, unix and windows', () => {
      expect(detectInstallMethod({hasBundledNode: false, root: '/usr/lib/node_modules/@hideandseeklab/aoox'})).to.equal('npm-global')
      expect(
        detectInstallMethod({
          hasBundledNode: false,
          root: String.raw`C:\Users\u\AppData\Roaming\npm\node_modules\@hideandseeklab\aoox`,
        }),
      ).to.equal('npm-global')
    })

    it('standalone tarball wins', () => {
      expect(detectInstallMethod({hasBundledNode: true, root: '/usr/local/lib/aoox'})).to.equal('standalone')
    })

    it('source checkout, npx and local dependency are "other"', () => {
      expect(detectInstallMethod({hasBundledNode: false, root: '/home/u/aoox-cli'})).to.equal('other')
      expect(
        detectInstallMethod({hasBundledNode: false, root: '/home/u/.npm/_npx/ab/node_modules/@hideandseeklab/aoox'}),
      ).to.equal('other')
      expect(detectInstallMethod({hasBundledNode: false, root: '/home/u/proj/node_modules/@hideandseeklab/aoox'})).to.equal(
        'other',
      )
    })
  })

  describe('fetchPackument', () => {
    it('returns the document', async () => {
      const fake = (async () => new Response(JSON.stringify({'dist-tags': {latest: '1.0.0'}}))) as unknown as typeof fetch
      expect((await fetchPackument(fake, 'http://x'))['dist-tags']?.latest).to.equal('1.0.0')
    })

    it('explains network failure and HTTP errors', async () => {
      const down = (async () => {
        throw new TypeError('fetch failed', {cause: new Error('ENOTFOUND')})
      }) as unknown as typeof fetch
      let message = ''
      try {
        await fetchPackument(down, 'http://x')
      } catch (error) {
        message = (error as Error).message
      }

      expect(message).to.contain('Could not reach the npm registry (ENOTFOUND)')
      const bad = (async () => new Response('', {status: 503})) as unknown as typeof fetch
      let second = ''
      try {
        await fetchPackument(bad, 'http://x')
      } catch (error) {
        second = (error as Error).message
      }

      expect(second).to.contain('503')
    })
  })
})
