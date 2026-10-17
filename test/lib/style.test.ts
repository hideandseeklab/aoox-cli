/* eslint-disable mocha/max-top-level-suites */
import {expect} from 'chai'

import {colorEnabled, errorLine, formatError, formatStep, formatSuccess, formatWarn, hintLine, makeStyle, stepLine, successLine, warnLine} from '../../src/lib/style.js'

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

describe('step-style lines', () => {
  const off = makeStyle(false)
  const on = makeStyle(true)

  it('plain output has no codes and no success symbol', () => {
    expect(formatStep(off, 'Build', 'web:1')).to.equal('==> Build web:1')
    expect(formatStep(off, 'Waiting')).to.equal('==> Waiting')
    expect(formatSuccess(off, false, 'Pushed', 'web:1')).to.equal('Pushed web:1')
    expect(formatWarn(off, 'careful')).to.equal('warn  careful')
  })

  it('coloured output: bold cyan arrow, bold label, cyan value, green success with symbol', () => {
    expect(formatStep(on, 'Build', 'web:1')).to.equal('\u001B[1m\u001B[36m==>\u001B[39m\u001B[22m \u001B[1mBuild\u001B[22m \u001B[36mweb:1\u001B[39m')
    expect(formatSuccess(on, true, 'Pushed', 'web:1')).to.equal('\u001B[32m✓\u001B[39m \u001B[32mPushed\u001B[39m \u001B[36mweb:1\u001B[39m')
    expect(formatWarn(on, 'x')).to.equal('\u001B[33mwarn\u001B[39m  x')
  })

  describe('process-bound helpers', () => {
    let saved: NodeJS.ProcessEnv

    beforeEach(() => {
      saved = {...process.env}
    })

    afterEach(() => {
      process.env = saved
    })

    it('honour NO_COLOR and FORCE_COLOR', () => {
      delete process.env.FORCE_COLOR
      process.env.NO_COLOR = '1'
      expect(stepLine('Build', 'x')).to.equal('==> Build x')
      expect(successLine('Done')).to.equal('Done')
      expect(hintLine('note')).to.equal('note')
      expect(warnLine('w')).to.equal('warn  w')
      delete process.env.NO_COLOR
      process.env.FORCE_COLOR = '1'
      expect(stepLine('Build')).to.contain('\u001B[36m==>')
      expect(successLine('Done')).to.contain('✓')
      expect(hintLine('note')).to.equal('\u001B[2mnote\u001B[22m')
      expect(warnLine('w')).to.contain('\u001B[33mwarn')
    })
  })
})
