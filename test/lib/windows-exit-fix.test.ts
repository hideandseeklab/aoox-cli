import {expect} from 'chai'

import {applyWindowsExitFix, type ExitLike} from '../../src/lib/windows-exit-fix.js'

function fakeProc(platform: NodeJS.Platform): ExitLike {
  return {
    exit(code) {
      throw new Error(`real exit called with ${String(code)}`)
    },
    exitCode: undefined,
    platform,
  }
}

describe('applyWindowsExitFix', () => {
  it('leaves process.exit alone on non-Windows platforms', () => {
    const proc = fakeProc('linux')
    const original = proc.exit
    applyWindowsExitFix(proc)
    expect(proc.exit).to.equal(original)
  })

  it('replaces process.exit on Windows so it sets exitCode instead of terminating', () => {
    const proc = fakeProc('win32')
    applyWindowsExitFix(proc)
    expect(() => proc.exit(2)).to.not.throw()
    expect(proc.exitCode).to.equal(2)
  })

  it('defaults to the current exitCode (then 0) when called without one', () => {
    const proc = fakeProc('win32')
    applyWindowsExitFix(proc)
    proc.exit()
    expect(proc.exitCode).to.equal(0)

    proc.exitCode = 5
    proc.exit()
    expect(proc.exitCode).to.equal(5)
  })
})
