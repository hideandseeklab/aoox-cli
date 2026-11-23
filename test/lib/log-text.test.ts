import {expect} from 'chai'

import {LogLines} from '../../src/lib/log-text.js'

const T = '2026-11-23T10:00:00.123456789Z'

describe('LogLines', () => {
  it('strips the Docker timestamp from every line', () => {
    const lines = new LogLines()
    expect(lines.push(`${T} one\n${T} two\n`)).to.equal('one\ntwo\n')
  })

  it('holds a partial line until it is complete, whatever the chunking', () => {
    const lines = new LogLines()
    const out = [`${T} he`, 'llo wor', `ld\n${T} next`, '\n'].map((c) => lines.push(c)).join('')
    expect(out).to.equal('hello world\nnext\n')
  })

  it('flush releases the unfinished last line', () => {
    const lines = new LogLines()
    expect(lines.push(`${T} tail`)).to.equal('')
    expect(lines.flush()).to.equal('tail')
    expect(lines.flush()).to.equal('')
  })

  it('keeps timestamps on request and leaves lines without one alone', () => {
    expect(new LogLines(true).push(`${T} x\n`)).to.equal(`${T} x\n`)
    expect(new LogLines().push('no stamp here\n')).to.equal('no stamp here\n')
  })
})
