import {expect} from 'chai'

import {imageRefFor, slugPart} from '../../src/lib/image-ref.js'

describe('image-ref lib', () => {
  describe('slugPart', () => {
    it('lowercases and collapses non-alphanumerics to single hyphens', () => {
      expect(slugPart('Smoke Test!!')).to.equal('smoke-test')
      expect(slugPart('  --Leading/Trailing--  ')).to.equal('leading-trailing')
    })

    it('caps length at 40 and falls back to "project" for an empty result', () => {
      expect(slugPart('a'.repeat(60))).to.equal('a'.repeat(40))
      expect(slugPart('!!!')).to.equal('project')
    })
  })

  describe('imageRefFor', () => {
    it('matches the shape the API itself builds (<registry>/<slug>/<appName>:<tag>)', () => {
      expect(
        imageRefFor({appName: 'welcome-app-37j8a9', projectName: 'Smoke Test', registryUrl: 'localhost:5000', tag: 'abc1234'}),
      ).to.equal('localhost:5000/smoke-test/welcome-app-37j8a9:abc1234')
    })
  })
})
