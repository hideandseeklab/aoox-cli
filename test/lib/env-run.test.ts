import {expect} from 'chai'

import {
  buildChildEnv,
  exitCodeForSignal,
  needsWindowsShell,
  quoteForCmd,
  splitAtDoubleDash,
} from '../../src/lib/env-run.js'

const resolve = (c: string): string | undefined => (c === 'npm' ? String.raw`C:\node\npm.cmd` : c === 'node' ? String.raw`C:\node\node.exe` : undefined)

describe('env-run', () => {
  describe('buildChildEnv', () => {
    it('puts the panel variables over the current environment', () => {
      const env = buildChildEnv({KEEP: 'k', PATH: '/bin', X: 'old'}, {X: 'new', Y: 'y'}, 'linux')
      expect(env).to.deep.equal({KEEP: 'k', PATH: '/bin', X: 'new', Y: 'y'})
    })

    it('does not change the base object', () => {
      const base = {A: '1'}
      buildChildEnv(base, {A: '2'}, 'linux')
      expect(base.A).to.equal('1')
    })

    it('on Windows replaces a variable whatever its case', () => {
      const env = buildChildEnv({Path: String.raw`C:\x`}, {PATH: String.raw`D:\y`}, 'win32')
      expect(env).to.deep.equal({PATH: String.raw`D:\y`})
    })

    it('on Linux names are case-sensitive', () => {
      const env = buildChildEnv({path: 'a'}, {PATH: 'b'}, 'linux')
      expect(env).to.deep.equal({PATH: 'b', path: 'a'})
    })
  })

  describe('splitAtDoubleDash', () => {
    it('splits at the first --; later -- stay in the command', () => {
      expect(splitAtDoubleDash(['--env', 'staging', '--', 'node', '-e', 'x', '--', 'y'])).to.deep.equal({
        command: ['node', '-e', 'x', '--', 'y'],
        own: ['--env', 'staging'],
      })
    })

    it('has no command without --', () => {
      expect(splitAtDoubleDash(['node', 'x'])).to.deep.equal({command: [], own: ['node', 'x']})
    })
  })

  describe('exitCodeForSignal', () => {
    it('is 128 plus the signal number', () => {
      expect(exitCodeForSignal('SIGINT')).to.equal(130)
      expect(exitCodeForSignal('SIGTERM')).to.equal(143)
    })
  })

  describe('Windows .cmd helpers', () => {
    it('quoteForCmd leaves plain arguments and wraps the rest', () => {
      expect(quoteForCmd('run')).to.equal('run')
      expect(quoteForCmd('a b')).to.equal('"a b"')
      expect(quoteForCmd('say "hi"')).to.equal('"say ""hi"""')
      expect(quoteForCmd('50%')).to.equal('"50%%"')
      expect(quoteForCmd('')).to.equal('""')
      expect(quoteForCmd('a&b')).to.equal('"a&b"')
    })

    it('needsWindowsShell only for .cmd/.bat on win32', () => {
      expect(needsWindowsShell('npm', 'win32', resolve)).to.equal(true)
      expect(needsWindowsShell('node', 'win32', resolve)).to.equal(false)
      expect(needsWindowsShell('unknown', 'win32', resolve)).to.equal(false)
      expect(needsWindowsShell('x.bat', 'win32', (c) => (c === 'never' ? c : undefined))).to.equal(true)
      expect(needsWindowsShell('npm', 'linux', resolve)).to.equal(false)
    })
  })
})
