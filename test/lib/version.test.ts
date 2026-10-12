import {expect} from 'chai'

import {compareVersions, outdatedCliWarning} from '../../src/lib/version.js'

describe('version lib', () => {
  describe('compareVersions', () => {
    it('orders numeric pre-release identifiers numerically', () => {
      expect(compareVersions('0.1.0-alpha.9', '0.1.0-alpha.10')).to.be.lessThan(0)
      expect(compareVersions('0.1.0-alpha.10', '0.1.0-alpha.9')).to.be.greaterThan(0)
    })

    it('ranks a release above its pre-releases', () => {
      expect(compareVersions('0.1.0-alpha.7', '0.1.0')).to.be.lessThan(0)
      expect(compareVersions('1.0.0', '1.0.0-rc.1')).to.be.greaterThan(0)
    })

    it('compares the core first and ignores build metadata and a v prefix', () => {
      expect(compareVersions('0.2.0-alpha.1', '0.1.9')).to.be.greaterThan(0)
      expect(compareVersions('v1.2.3+build5', '1.2.3')).to.equal(0)
    })

    it('orders alpha before beta and longer identifier lists after shorter ones', () => {
      expect(compareVersions('1.0.0-alpha', '1.0.0-beta')).to.be.lessThan(0)
      expect(compareVersions('1.0.0-alpha', '1.0.0-alpha.1')).to.be.lessThan(0)
    })

    it('returns null for non-semver input', () => {
      expect(compareVersions('latest', '1.0.0')).to.equal(null)
    })
  })

  describe('outdatedCliWarning', () => {
    it('warns when the CLI is older than the panel', () => {
      const text = outdatedCliWarning('0.1.0-alpha.7', '0.1.0-alpha.10')
      expect(text).to.contain('Update it: aoox update')
      expect(text).to.contain('0.1.0-alpha.7')
    })

    it('stays silent when equal, newer, unknown or unparsable', () => {
      expect(outdatedCliWarning('0.1.0-alpha.8', '0.1.0-alpha.8')).to.equal(null)
      expect(outdatedCliWarning('0.2.0', '0.1.0')).to.equal(null)
      expect(outdatedCliWarning('0.1.0', '')).to.equal(null)
      expect(outdatedCliWarning('0.1.0', 'dev')).to.equal(null)
    })
  })
})
