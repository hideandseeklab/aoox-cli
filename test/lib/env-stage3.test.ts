/* eslint-disable no-template-curly-in-string */
import {expect} from 'chai'
import {execFileSync} from 'node:child_process'

import {describeSummary, planPromotion} from '../../src/lib/env-plan.js'
import {buildChildEnv, layerVariables} from '../../src/lib/env-run.js'
import {
  checkEnvFile,
  defaultFileFor,
  formatEnv,
  isEmptyChange,
  shellQuote,
  summarizeChange,
  toJson,
  toRecord,
  toShell,
} from '../../src/lib/env-text.js'

describe('env stage 3', () => {
  describe('checkEnvFile (push)', () => {
    it('accepts comments, blanks, = in values and ${{}} references; normalises CRLF, BOM and trailing blank lines', () => {
      const r = checkEnvFile('\uFEFF# c\r\nA=1\r\n\r\nURL=a=b\r\nREF=${{vars.A}}\r\n\r\n\r\n')
      expect(r.problems).to.deep.equal([])
      expect(r.text).to.equal('# c\nA=1\n\nURL=a=b\nREF=${{vars.A}}')
    })

    it('names every bad line: no =, export prefix, invalid name, trailing whitespace, duplicates', () => {
      const r = checkEnvFile('GOOD=1\nnoequals\nexport A=1\n1BAD=x\nSPACE=x \nGOOD=2\n=v')
      expect(r.problems).to.deep.equal([
        'Line 2: expected NAME=value',
        'Line 3: remove "export" (write NAME=value)',
        'Line 4: "1BAD" is not a valid variable name (letters, digits and _, not starting with a digit)',
        'Line 5: SPACE ends with whitespace, which the panel trims; remove it',
        'Line 6: GOOD is already defined on line 1',
        'Line 7: expected NAME=value',
      ])
    })

    it('warns (but accepts) values wrapped in quotes, which are stored as they are', () => {
      const r = checkEnvFile('A="x y"\nB=\'z\'\nC=plain')
      expect(r.problems).to.deep.equal([])
      expect(r.warnings).to.have.length(2)
      expect(r.warnings[0]).to.match(/Line 1: A is quoted/)
    })

    it('refuses a file over the size limit', () => {
      expect(checkEnvFile(`A=${'x'.repeat(20_000)}`).problems.join('\n')).to.match(/longer than 20000/)
    })
  })

  describe('summarizeChange (push summary)', () => {
    it('lists added, changed and removed names and counts the unchanged', () => {
      const s = summarizeChange('A=1\nB=2\nC=3\n# note', 'A=1\nB=9\nD=4')
      expect(s).to.deep.equal({added: ['D'], changed: ['B'], removed: ['C'], unchanged: 1})
      expect(isEmptyChange(s)).to.equal(false)
    })

    it('treats comments and order as no change, and the last definition as the value', () => {
      expect(isEmptyChange(summarizeChange('A=1\nB=2', '# hi\nB=2\nA=1'))).to.equal(true)
      expect(summarizeChange('A=1\nA=2', 'A=2')).to.deep.equal({added: [], changed: [], removed: [], unchanged: 1})
    })

    it('does not put values in the result', () => {
      expect(JSON.stringify(summarizeChange('A=secret1', 'A=secret2'))).to.not.match(/secret/)
    })
  })

  describe('shell output', () => {
    it(String.raw`quotes a single quote as '\''`, () => {
      expect(shellQuote("it's")).to.equal(String.raw`'it'\''s'`)
      expect(shellQuote('')).to.equal("''")
    })

    it('writes export lines, skips names that are not shell identifiers', () => {
      expect(toShell('A=1\nB=two words\n')).to.equal("export A='1'\nexport B='two words'\n")
      expect(toShell('')).to.equal('')
    })

    const nasty = ['plain', "it's", 'a b', '$HOME', '`id`', '$(echo pwn)', String.raw`back\slash`, '"dq"', 'semi;colon', 'glob*?', '#hash', 'a=b=c', '!bang', '', 'unicode-é-日本', "'''"]

    it('round-trips through a real POSIX shell eval (Git Bash / sh)', function () {
      let sh: string
      try {
        sh = process.platform === 'win32' ? String.raw`C:\Program Files\Git\bin\sh.exe` : 'sh'
        execFileSync(sh, ['-c', 'true'])
      } catch {
        this.skip()
        return
      }

      const text = nasty.map((v, i) => `K${i}=${v}`).join('\n')
      const script = `${toShell(text)}node -e "console.log(JSON.stringify(process.env))"`
      const out = execFileSync(sh, ['-c', script], {encoding: 'utf8', env: {...process.env, PATH: process.env.PATH ?? ''}})
      const env = JSON.parse(out) as Record<string, string>
      for (const [i, v] of nasty.entries()) expect(env[`K${i}`], `K${i}`).to.equal(v)
    })
  })

  describe('json and dotenv output', () => {
    it('json is the record in file order, values verbatim', () => {
      expect(JSON.parse(toJson('B=2\nA=a=b\n# c\nC='))).to.deep.equal({A: 'a=b', B: '2', C: ''})
      expect(Object.keys(JSON.parse(toJson('B=2\nA=1')) as object)).to.deep.equal(['B', 'A'])
    })

    it('dotenv is the stored text with one final newline; formatEnv picks the format', () => {
      expect(formatEnv('# c\nA=1', 'dotenv')).to.equal('# c\nA=1\n')
      expect(formatEnv('A=1\n', 'dotenv')).to.equal('A=1\n')
      expect(formatEnv('', 'dotenv')).to.equal('')
      expect(formatEnv('A=1', 'json')).to.equal('{\n  "A": "1"\n}\n')
      expect(formatEnv('A=1', 'shell')).to.equal("export A='1'\n")
    })

    it('default file names by format', () => {
      expect([defaultFileFor('dotenv'), defaultFileFor('json'), defaultFileFor('shell')]).to.deep.equal(['.env', '.env.json', '.env.sh'])
    })
  })

  describe('run layering', () => {
    it('process.env < aoox environment < local file', () => {
      const aoox = toRecord('A=aoox\nB=aoox\nC=aoox')
      const file = toRecord('B=file\nD=file')
      const env = buildChildEnv({A: 'proc', B: 'proc', E: 'proc'}, layerVariables(aoox, file), 'linux')
      expect(env).to.deep.equal({A: 'aoox', B: 'file', C: 'aoox', D: 'file', E: 'proc'})
    })

    it('layerVariables does not change its inputs and keeps empty values', () => {
      const a = {X: '1'}
      const merged = layerVariables(a, {X: ''})
      expect(merged).to.deep.equal({X: ''})
      expect(a).to.deep.equal({X: '1'})
    })
  })

  describe('planPromotion', () => {
    const source = 'A=1\nB=2\nC=3\nD=4'
    const target = 'A=1\nB=old\n# c\nZ=9'

    it('splits the chosen keys into added, changed, same and missing (names only)', () => {
      expect(planPromotion(source, target, ['A', 'B', 'C', 'NOPE'])).to.deep.equal({
        added: ['C'],
        changed: ['B'],
        missing: ['NOPE'],
        same: ['A'],
      })
    })

    it('--all means every variable of the source', () => {
      const plan = planPromotion(source, target, 'all')
      expect(plan).to.deep.equal({added: ['C', 'D'], changed: ['B'], missing: [], same: ['A']})
    })

    it('deduplicates the asked names', () => {
      expect(planPromotion(source, target, ['C', 'C']).added).to.deep.equal(['C'])
    })
  })

  describe('describeSummary (history)', () => {
    it('shows counts and the first names, flag changes, and the comment-only case', () => {
      expect(describeSummary({added: ['A', 'B'], changed: ['C'], flags: [], removed: ['D', 'E', 'F', 'G']})).to.equal('+2 A,B  ~1 C  -4 D,E,F,…')
      expect(describeSummary({added: [], changed: [], flags: ['K'], removed: []})).to.equal('secret flag: K')
      expect(describeSummary({added: [], changed: [], flags: [], removed: []})).to.equal('comments or order only')
    })
  })
})
