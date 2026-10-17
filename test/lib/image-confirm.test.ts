import {expect} from 'chai'
import {PassThrough, Writable} from 'node:stream'

import {askChoice, confirmDerived, type ConfirmPrompts, isInteractive, parseChoice, validateNameVersion} from '../../src/lib/image-confirm.js'

function prompts(answer: 'edit' | 'no' | 'yes', edited = 'other:2.0.0'): ConfirmPrompts & {asked: string[]} {
  const asked: string[] = []
  return {
    asked,
    async choose(m) {
      asked.push(m)
      return answer
    },
    async edit() {
      return edited
    },
  }
}

const base = {derived: true, interactive: true, raw: 'web:1.4.2', verb: 'Build', yes: false}

describe('confirmDerived', () => {
  it('never asks for a fully typed name:version', async () => {
    const p = prompts('no')
    expect(await confirmDerived({...base, derived: false, prompts: p})).to.deep.equal({edited: false, kind: 'use', raw: 'web:1.4.2'})
    expect(p.asked).to.have.length(0)
  })

  it('--yes skips the prompt, also without a terminal', async () => {
    const p = prompts('no')
    expect((await confirmDerived({...base, interactive: false, prompts: p, yes: true})).kind).to.equal('use')
    expect(p.asked).to.have.length(0)
  })

  it('refuses a derived value when nobody can be asked', async () => {
    const p = prompts('yes')
    expect(await confirmDerived({...base, interactive: false, prompts: p})).to.deep.equal({kind: 'refuse'})
    expect(p.asked).to.have.length(0)
  })

  it('yes / no / edit', async () => {
    const yes = prompts('yes')
    expect(await confirmDerived({...base, prompts: yes})).to.deep.equal({edited: false, kind: 'use', raw: 'web:1.4.2'})
    expect(yes.asked).to.deep.equal(['Build web:1.4.2?'])
    expect(await confirmDerived({...base, prompts: prompts('no')})).to.deep.equal({kind: 'abort'})
    expect(await confirmDerived({...base, prompts: prompts('edit', '  other:2.0.0 ')})).to.deep.equal({
      edited: true,
      kind: 'use',
      raw: 'other:2.0.0',
    })
  })

  it('validates an edited value and the CI / tty rule', () => {
    expect(validateNameVersion('a:1')).to.equal(true)
    expect(validateNameVersion('a')).to.contain('version is required')
    expect(validateNameVersion('A:1')).to.contain('lowercase')
    expect(isInteractive({}, true)).to.equal(true)
    expect(isInteractive({CI: 'true'}, true)).to.equal(false)
    expect(isInteractive({}, false)).to.equal(false)
  })

  it('accepts y/yes/empty, n/no, e/edit in any case, rejects the rest', () => {
    for (const v of ['', ' ', 'y', 'Y', 'yes', 'YES']) expect(parseChoice(v)).to.equal('yes')
    for (const v of ['n', 'N', 'no']) expect(parseChoice(v)).to.equal('no')
    for (const v of ['e', 'E', 'edit']) expect(parseChoice(v)).to.equal('edit')
    for (const v of ['h', 'x', 'ye', 'yn']) expect(parseChoice(v)).to.equal(undefined)
  })

  it('renders (Y/n/e), re-asks on bad input and resolves', async () => {
    const input = new PassThrough()
    const out: string[] = []
    const output = new Writable({
      write(chunk, _e, cb) {
        out.push(String(chunk))
        cb()
      },
    })
    const p = askChoice('Build web:1.4.2?', input, output)
    input.write('h\n')
    input.write('E\n')
    expect(await p).to.equal('edit')
    const text = out.join('')
    expect(text).to.contain('? Build web:1.4.2? (Y/n/e) ')
    expect(text).to.contain('Please answer')
    expect(text).not.to.contain('Yneh')
  })

  it('rejects with ExitPromptError when the input ends', async () => {
    const input = new PassThrough()
    const p = askChoice('Build web:1.4.2?', input, new Writable({write: (_c, _e, cb) => cb()}))
    input.end()
    try {
      await p
      expect.fail('should reject')
    } catch (error) {
      expect((error as Error).name).to.equal('ExitPromptError')
    }
  })
})
