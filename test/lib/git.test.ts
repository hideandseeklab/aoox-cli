import {expect} from 'chai'

import {sanitizeTag} from '../../src/lib/git.js'

describe('sanitizeTag', () => {
  it('lowercases and replaces characters Docker/the API reject', () => {
    expect(sanitizeTag('2026-09-24T10:00:00.000Z')).to.equal('2026-09-24t10-00-00.000z')
  })

  it('leaves an already-clean git short SHA (+ -dirty) alone', () => {
    expect(sanitizeTag('abc1234')).to.equal('abc1234')
    expect(sanitizeTag('abc1234-dirty')).to.equal('abc1234-dirty')
  })

  it('strips a leading dot/hyphen and falls back to "build" when empty', () => {
    expect(sanitizeTag('-.leading')).to.equal('leading')
    expect(sanitizeTag('///')).to.equal('build')
  })

  it('caps length at 128', () => {
    expect(sanitizeTag('a'.repeat(200))).to.have.lengthOf(128)
  })
})
