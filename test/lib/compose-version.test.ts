import {expect} from 'chai'

import {composeAtLeast, overrideDryRunNote, overrideGuardMessage, parseComposeVersion, usesOverrideTag} from '../../src/lib/compose-version.js'

describe('compose version guard', () => {
  describe('parseComposeVersion', () => {
    it('reads plain, v-prefixed and suffixed versions', () => {
      expect(parseComposeVersion('2.29.1')).to.deep.equal([2, 29, 1])
      expect(parseComposeVersion('v2.24.4-desktop.1\n')).to.deep.equal([2, 24, 4])
      expect(parseComposeVersion('5.5.1')).to.deep.equal([5, 5, 1])
    })

    it('returns undefined for anything else', () => {
      expect(parseComposeVersion('')).to.equal(undefined)
      expect(parseComposeVersion()).to.equal(undefined)
      expect(parseComposeVersion('docker-compose version 1.29')).to.equal(undefined)
      expect(parseComposeVersion('2.24')).to.equal(undefined)
    })
  })

  describe('composeAtLeast', () => {
    it('compares numerically, not as strings', () => {
      expect(composeAtLeast('2.24.4')).to.equal(true)
      expect(composeAtLeast('2.24.3')).to.equal(false)
      expect(composeAtLeast('2.9.9')).to.equal(false)
      expect(composeAtLeast('2.100.0')).to.equal(true)
      expect(composeAtLeast('3.0.0')).to.equal(true)
      expect(composeAtLeast('1.29.2')).to.equal(false)
    })

    it('treats an unreadable version as too old', () => {
      expect(composeAtLeast()).to.equal(false)
      expect(composeAtLeast('')).to.equal(false)
    })
  })

  describe('usesOverrideTag', () => {
    it('finds the tag but not one in a comment', () => {
      expect(usesOverrideTag('services:\n  web:\n    ports: !override ["127.0.0.1:3000:3000"]\n')).to.equal(true)
      expect(usesOverrideTag('# needs !override (Compose >= 2.24.4)\n{"services":{}}')).to.equal(false)
      expect(usesOverrideTag()).to.equal(false)
    })
  })

  describe('overrideGuardMessage', () => {
    const restricted = 'services:\n  web:\n    ports: !override ["x"]\n'

    it('is silent without the tag, or with a new enough Compose', () => {
      expect(overrideGuardMessage('{"services":{}}', '2.1.0')).to.equal(undefined)
      expect(overrideGuardMessage()).to.equal(undefined)
      expect(overrideGuardMessage(restricted, '2.24.4')).to.equal(undefined)
    })

    it('refuses an old version and names both ways out', () => {
      const msg = overrideGuardMessage(restricted, '2.20.0') ?? ''
      expect(msg).to.contain('2.20.0')
      expect(msg).to.contain('2.24.4')
      expect(msg).to.contain('upgrade the Docker Compose plugin')
      expect(msg).to.contain('Only allow access through the domain')
    })

    it('refuses when the version cannot be read', () => {
      const msg = overrideGuardMessage(restricted, '') ?? ''
      expect(msg).to.contain('could not be read')
    })
  })

describe('overrideDryRunNote', () => {
  const withTag = 'services:\n  web:\n    ports: !override\n      - "127.0.0.1:3000:3000"\n'

  it('says nothing without the !override tag', () => {
    expect(overrideDryRunNote('services: {}\n', '2.10.0', true)).to.equal(undefined)
    expect(overrideDryRunNote(undefined, undefined, false)).to.equal(undefined)
  })

  it('says nothing when Compose is new enough', () => {
    expect(overrideDryRunNote(withTag, '2.24.4', true)).to.equal(undefined)
  })

  it('warns that a real run would stop when Compose is too old or unreadable', () => {
    expect(overrideDryRunNote(withTag, '2.20.0', true)).to.contain('would stop').and.to.contain('2.20.0')
    expect(overrideDryRunNote(withTag, '', true)).to.contain('could not be read')
  })

  it('says the version could not be checked when Docker is not available', () => {
    expect(overrideDryRunNote(withTag, undefined, false)).to.contain('could not be checked')
  })
})
})
