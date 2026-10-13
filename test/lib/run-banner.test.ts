import {expect} from 'chai'

import {colorEnabled, formatBanner, formatWarning, makeStyle, variableCount} from '../../src/lib/run-banner.js'

const plain = makeStyle(false)
const color = makeStyle(true)

describe('run-banner', () => {
  it('colorEnabled follows TTY, NO_COLOR and FORCE_COLOR', () => {
    expect(colorEnabled({}, true)).to.equal(true)
    expect(colorEnabled({}, false)).to.equal(false)
    expect(colorEnabled({TERM: 'dumb'}, true)).to.equal(false)
    expect(colorEnabled({NO_COLOR: '1'}, true)).to.equal(false)
    expect(colorEnabled({NO_COLOR: ''}, true)).to.equal(true)
    expect(colorEnabled({FORCE_COLOR: '1'}, false)).to.equal(true)
    expect(colorEnabled({FORCE_COLOR: '0'}, true)).to.equal(false)
    expect(colorEnabled({FORCE_COLOR: '1', NO_COLOR: '1'}, true)).to.equal(false)
  })

  it('pluralises', () => {
    expect(variableCount(1)).to.equal('1 variable')
    expect(variableCount(0)).to.equal('0 variables')
    expect(variableCount(12)).to.equal('12 variables')
  })

  it('formats the linked and single banners', () => {
    expect(formatBanner(12, {kind: 'linked', layers: ['common/development', 'backend/development'], owner: 'Application "web"'}, plain)).to.equal(
      'aoox  Injecting 12 variables into your process · Application "web": common/development < backend/development < own env',
    )
    expect(formatBanner(1, {kind: 'single', label: 'common/development'}, plain)).to.equal(
      'aoox  Injecting 1 variable from common/development (no links, no own env)',
    )
  })

  it('adds ANSI codes only with colour on', () => {
    const src = {kind: 'single', label: 'a/b'} as const
    expect(formatBanner(2, src, plain)).to.not.contain('\u001B')
    const out = formatBanner(2, src, color)
    expect(out).to.contain('\u001B[36ma/b\u001B[39m')
    expect(out).to.contain('\u001B[1m2 variables\u001B[22m')
    expect(formatWarning('x', color)).to.equal('\u001B[33mwarn\u001B[39m  x')
    expect(formatWarning('x', plain)).to.equal('warn  x')
  })
})
