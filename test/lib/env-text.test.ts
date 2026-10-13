/* eslint-disable no-template-curly-in-string */
import {expect} from 'chai'

import {
  EnvInputError,
  hasReferences,
  keysOf,
  parseAssignments,
  parseEnvLines,
  parseKeys,
  setVariables,
  toRecord,
  unsetVariables,
} from '../../src/lib/env-text.js'

describe('env-text', () => {
  describe('parseEnvLines (mirrors the API)', () => {
    it('skips blanks, comments and lines without a key; trims the line', () => {
      expect(parseEnvLines('# c\n\n  A=1  \nnoequals\n=novalue\nB=2')).to.deep.equal([
        ['A', '1'],
        ['B', '2'],
      ])
    })

    it('keeps everything after the first = verbatim (quotes, #, spaces, =)', () => {
      expect(parseEnvLines('MSG=hello "big" world # not a comment\nURL=a=b=c\nQ=\'x\'\nE=')).to.deep.equal([
        ['MSG', 'hello "big" world # not a comment'],
        ['URL', 'a=b=c'],
        ['Q', "'x'"],
        ['E', ''],
      ])
    })

    it('handles CRLF', () => {
      expect(parseEnvLines('A=1\r\nB=2\r\n')).to.deep.equal([
        ['A', '1'],
        ['B', '2'],
      ])
    })

    it('keysOf dedupes and toRecord lets the last definition win', () => {
      expect(keysOf('A=1\nB=2\nA=3')).to.deep.equal(['A', 'B'])
      expect(toRecord('A=1\nB=2\nA=3')).to.deep.equal({A: '3', B: '2'})
    })

    it('hasReferences finds ${{...}} in values only', () => {
       
      expect(hasReferences('A=${{vars.B}}')).to.equal(true)
      expect(hasReferences('A=1')).to.equal(false)
    })
  })

  describe('parseAssignments', () => {
    it('splits at the first = and keeps the value exactly', () => {
      expect(parseAssignments(['A=b', 'URL=a=b?c=d', 'MSG=he said "hi" & left', "Q='x'", 'H=#notacomment', 'E='])).to.deep.equal([
        ['A', 'b'],
        ['URL', 'a=b?c=d'],
        ['MSG', 'he said "hi" & left'],
        ['Q', "'x'"],
        ['H', '#notacomment'],
        ['E', ''],
      ])
    })

    it('keeps leading spaces (the API only trims the line)', () => {
      expect(parseAssignments(['A= x'])).to.deep.equal([['A', ' x']])
    })

    it('the last of a repeated key wins', () => {
      expect(parseAssignments(['A=1', 'B=2', 'A=3'])).to.deep.equal([
        ['A', '3'],
        ['B', '2'],
      ])
    })

    it('rejects bad input with a message naming the argument', () => {
      expect(() => parseAssignments([])).to.throw(EnvInputError, /at least one/)
      expect(() => parseAssignments(['NOEQUALS'])).to.throw(EnvInputError, /NOEQUALS.*KEY=VALUE/)
      expect(() => parseAssignments(['1BAD=x'])).to.throw(EnvInputError, /1BAD.*valid variable name/)
      expect(() => parseAssignments(['A B=x'])).to.throw(EnvInputError, /valid variable name/)
      expect(() => parseAssignments(['=x'])).to.throw(EnvInputError, /valid variable name/)
      expect(() => parseAssignments(['A=line1\nline2'])).to.throw(EnvInputError, /multi-line/)
      expect(() => parseAssignments(['A=trailing '])).to.throw(EnvInputError, /whitespace/)
    })
  })

  describe('parseKeys', () => {
    it('validates and dedupes names', () => {
      expect(parseKeys(['A', 'B', 'A'])).to.deep.equal(['A', 'B'])
      expect(() => parseKeys([])).to.throw(EnvInputError)
      expect(() => parseKeys(['A=1'])).to.throw(EnvInputError, /only the name/)
      expect(() => parseKeys(['bad-name'])).to.throw(EnvInputError, /valid variable name/)
    })
  })

  describe('setVariables / unsetVariables', () => {
    const base = '# database\nDB_URL=postgres://x\n\n# api\nAPI=1\nAPI_OLD=2'

    it('replaces in place, keeping comments, blanks and order', () => {
      const r = setVariables(base, [['API', 'two']])
      expect(r.text).to.equal('# database\nDB_URL=postgres://x\n\n# api\nAPI=two\nAPI_OLD=2')
      expect(r.updated).to.deep.equal(['API'])
      expect(r.added).to.deep.equal([])
    })

    it('appends new variables at the end', () => {
      const r = setVariables(base, [['NEW', 'x y']])
      expect(r.text.endsWith('API_OLD=2\nNEW=x y')).to.equal(true)
      expect(r.added).to.deep.equal(['NEW'])
    })

    it('appends to an empty text and ignores trailing blank lines before appending', () => {
      expect(setVariables('', [['A', '1']]).text).to.equal('A=1')
      expect(setVariables('A=1\n\n', [['B', '2']]).text).to.equal('A=1\nB=2')
    })

    it('drops later duplicates of an updated key', () => {
      expect(setVariables('A=1\nB=2\nA=3', [['A', '9']]).text).to.equal('A=9\nB=2')
    })

    it('does not treat a commented-out variable as a definition', () => {
      const r = setVariables('# A=old\nB=1', [['A', 'new']])
      expect(r.text).to.equal('# A=old\nB=1\nA=new')
      expect(r.added).to.deep.equal(['A'])
    })

    it('matches keys by name, not by prefix', () => {
      expect(setVariables('API_OLD=2', [['API', '1']]).text).to.equal('API_OLD=2\nAPI=1')
    })

    it('normalises CRLF to LF', () => {
      expect(setVariables('A=1\r\nB=2', [['A', '3']]).text).to.equal('A=3\nB=2')
    })

    it('unset removes every definition, keeps the rest and reports missing keys', () => {
      const r = unsetVariables('# c\nA=1\nB=2\nA=3', ['A', 'NOPE'])
      expect(r.text).to.equal('# c\nB=2')
      expect(r.removed).to.deep.equal(['A'])
      expect(r.missing).to.deep.equal(['NOPE'])
    })

    it('round-trips awkward values through set, parse and the record', () => {
      const awkward = ['plain', 'has space', 'a=b=c', 'say "hi"', "it's", 'x # y', '$HOME', String.raw`\n`, '', ' lead', '${{vars.X}}']
      const pairs = awkward.map((v, i) => [`K${i}`, v] as [string, string])
      const {text} = setVariables('', pairs)
      expect(parseEnvLines(text)).to.deep.equal(pairs)
      // A second set of the same values changes nothing.
      expect(setVariables(text, pairs).text).to.equal(text)
    })
  })
})
