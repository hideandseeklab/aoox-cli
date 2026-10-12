import {expect} from 'chai'

import {ImageNameError, parseImageName, registryHost, suggestNextVersion} from '../../src/lib/image-ref.js'

describe('image name parsing', () => {
  describe('parseImageName', () => {
    it('parses short and full names', () => {
      expect(parseImageName('myapp:1.0.0')).to.deep.equal({host: null, repo: 'myapp', tag: '1.0.0'})
      expect(parseImageName('team/api:v2')).to.deep.equal({host: null, repo: 'team/api', tag: 'v2'})
      expect(parseImageName('localhost:5000/myapp:1')).to.deep.equal({host: 'localhost:5000', repo: 'myapp', tag: '1'})
      expect(parseImageName('reg.example.com/a/b:latest')).to.deep.equal({host: 'reg.example.com', repo: 'a/b', tag: 'latest'})
    })

    it('keeps a bare name (no version) so the caller can explain', () => {
      expect(parseImageName('myapp')).to.deep.equal({host: null, repo: 'myapp', tag: null})
    })

    it('rejects uppercase, digests, bad names and bad tags', () => {
      const long = `a:${'x'.repeat(129)}`
      for (const bad of ['MyApp:1', 'myapp:V1', 'a@sha256:abc', 'my app:1', '-x:1', 'a//b:1', 'a:-1', '', long]) {
        expect(() => parseImageName(bad), bad).to.throw(ImageNameError)
      }
    })

    it('flags an empty version as missing-version', () => {
      try {
        parseImageName('myapp:')
        expect.fail('should throw')
      } catch (error) {
        expect((error as ImageNameError).kind).to.equal('missing-version')
      }
    })
  })

  it('registryHost strips scheme and slashes', () => {
    expect(registryHost('https://ghcr.io/')).to.equal('ghcr.io')
    expect(registryHost('localhost:5000')).to.equal('localhost:5000')
  })

  describe('suggestNextVersion', () => {
    it('bumps the last number', () => {
      expect(suggestNextVersion('1.0.0')).to.equal('1.0.1')
      expect(suggestNextVersion('1.0.9')).to.equal('1.0.10')
      expect(suggestNextVersion('v2')).to.equal('v3')
      expect(suggestNextVersion('1.0.0-rc.1')).to.equal('1.0.0-rc.2')
      expect(suggestNextVersion('007')).to.equal('008')
    })

    it('gives up on non-numeric versions', () => {
      expect(suggestNextVersion('latest')).to.equal(null)
      expect(suggestNextVersion('abc1234')).to.equal(null)
    })
  })
})
