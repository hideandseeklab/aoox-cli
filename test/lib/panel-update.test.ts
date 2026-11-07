import {expect} from 'chai'

import {newerPublishedVersion, pinnedAdvice} from '../../src/lib/panel-update.js'

const block = (latestVersion: null | string) => ({latestVersion, tracking: 'pinned' as const})

describe('panel update', () => {
  it('returns the latest published version when newer', () => {
    expect(newerPublishedVersion(block('0.1.0-beta.1'), '0.1.0-beta.0')).to.equal('0.1.0-beta.1')
    expect(newerPublishedVersion(block('0.1.0-beta.10'), '0.1.0-beta.9')).to.equal('0.1.0-beta.10')
  })

  it('returns null when equal, older, unknown, or the API has no version block', () => {
    expect(newerPublishedVersion(block('0.1.0-beta.1'), '0.1.0-beta.1')).to.equal(null)
    expect(newerPublishedVersion(block('0.1.0-beta.0'), '0.1.0-beta.1')).to.equal(null)
    expect(newerPublishedVersion(block(null), '0.1.0-beta.1')).to.equal(null)
    expect(newerPublishedVersion(undefined, '0.1.0-beta.1')).to.equal(null)
    expect(newerPublishedVersion(block('latest'), '0.1.0-beta.1')).to.equal(null)
  })

  it('pinned advice names both versions, the env variables and reinstall', () => {
    const text = pinnedAdvice('0.1.0-beta.1', '0.1.0-beta.0').join('\n')
    for (const part of ['0.1.0-beta.1', '0.1.0-beta.0', 'API_IMAGE', 'WEB_IMAGE', 'aoox reinstall']) expect(text).to.contain(part)
    expect(text).to.not.contain('Already up to date')
  })
})
