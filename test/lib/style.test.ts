import {expect} from 'chai'

import {colorEnabled, errorLine, formatError, makeStyle} from '../../src/lib/style.js'

describe('style', () => {
  it('formatError is a plain "error" label with two spaces when colour is off', () => {
    expect(formatError('boom', makeStyle(false))).to.equal('error  boom')
  })

  it('formatError colours only the label when colour is on', () => {
    expect(formatError('boom', makeStyle(true))).to.equal('\u001B[31merror\u001B[39m  boom')
  })

  it('colour follows TTY, NO_COLOR and FORCE_COLOR', () => {
    expect(colorEnabled({}, true)).to.equal(true)
    expect(colorEnabled({}, false)).to.equal(false)
    expect(colorEnabled({NO_COLOR: '1'}, true)).to.equal(false)
    expect(colorEnabled({FORCE_COLOR: '1'}, false)).to.equal(true)
    expect(colorEnabled({FORCE_COLOR: '1', NO_COLOR: '1'}, true)).to.equal(false)
  })

  describe('errorLine', () => {
    let saved: NodeJS.ProcessEnv

    beforeEach(() => {
      saved = {...process.env}
    })

    afterEach(() => {
      process.env = saved
    })

    it('honours NO_COLOR and FORCE_COLOR', () => {
      delete process.env.FORCE_COLOR
      process.env.NO_COLOR = '1'
      expect(errorLine('x')).to.equal('error  x')
      delete process.env.NO_COLOR
      process.env.FORCE_COLOR = '1'
      expect(errorLine('x')).to.equal('\u001B[31merror\u001B[39m  x')
    })
  })
})
