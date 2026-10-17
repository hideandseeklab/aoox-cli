import {expect} from 'chai'

import {askChoice} from '../../src/lib/image-confirm.js'
import {handleInterrupt, INTERRUPT_EXIT_CODE, isPromptInterrupt} from '../../src/lib/interrupt.js'

function fakeIo(isTTY: boolean) {
  const out: string[] = []
  const codes: number[] = []
  return {codes, io: {exit: (code: number) => codes.push(code), isTTY, write: (text: string) => out.push(text)}, out}
}

describe('interrupt handling', () => {
  it('recognises the ExitPromptError that prompts throw on Ctrl+C', () => {
    const error = new Error('User force closed the prompt with SIGINT')
    error.name = 'ExitPromptError'
    expect(isPromptInterrupt(error)).to.equal(true)
    expect(isPromptInterrupt(new Error('boom'))).to.equal(false)
    expect(isPromptInterrupt('ExitPromptError')).to.equal(false)
    expect(isPromptInterrupt(null)).to.equal(false)
  })

  it('prints one plain line and exits 130', () => {
    const error = Object.assign(new Error('x'), {name: 'ExitPromptError'})
    const plain = fakeIo(false)
    expect(handleInterrupt(error, plain.io)).to.equal(true)
    expect(plain.out.join('')).to.equal('Aborted.\n')
    expect(plain.codes).to.deep.equal([INTERRUPT_EXIT_CODE])
    expect(INTERRUPT_EXIT_CODE).to.equal(130)
    const tty = fakeIo(true)
    handleInterrupt(error, tty.io)
    expect(tty.out.join('')).to.equal('\nAborted.\n')
  })

  it('ignores every other error', () => {
    const f = fakeIo(false)
    expect(handleInterrupt(new Error('boom'), f.io)).to.equal(false)
    expect(f.out).to.deep.equal([])
    expect(f.codes).to.deep.equal([])
  })

  it('treats a closed input at the readline prompt as an interrupt', async () => {
    const {PassThrough} = await import('node:stream')
    const input = new PassThrough()
    const output = new PassThrough()
    const pending = askChoice('Build x?', input, output)
    input.end()
    try {
      await pending
      expect.fail('should reject')
    } catch (error) {
      expect(isPromptInterrupt(error)).to.equal(true)
    }
  })
})
