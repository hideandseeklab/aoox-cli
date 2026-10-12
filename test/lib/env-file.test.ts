/* eslint-disable no-bitwise */
import {expect} from 'chai'
import {execFileSync} from 'node:child_process'
import {mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {FileExistsError, gitIgnoreStatus, writeEnvFile} from '../../src/lib/env-file.js'

function hasGit(): boolean {
  try {
    execFileSync('git', ['--version'], {stdio: 'ignore'})
    return true
  } catch {
    return false
  }
}

describe('env-file', () => {

  describe('writeEnvFile', () => {
    let dir: string

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'aoox-envfile-'))
    })

    afterEach(() => {
      rmSync(dir, {force: true, recursive: true})
    })

    it('writes the text with a trailing newline', async () => {
      const path = join(dir, '.env')
      await writeEnvFile(path, 'A=1\nB=x y', false)
      expect(readFileSync(path, 'utf8')).to.equal('A=1\nB=x y\n')
    })

    it('writes an empty environment as an empty file', async () => {
      const path = join(dir, '.env')
      await writeEnvFile(path, '', false)
      expect(readFileSync(path, 'utf8')).to.equal('')
    })

    it('refuses to overwrite an existing file and leaves it untouched', async () => {
      const path = join(dir, '.env')
      writeFileSync(path, 'KEEP=me\n')
      let caught: unknown
      try {
        await writeEnvFile(path, 'A=1', false)
      } catch (error) {
        caught = error
      }

      expect(caught).to.be.instanceOf(FileExistsError)
      expect(readFileSync(path, 'utf8')).to.equal('KEEP=me\n')
    })

    it('overwrites with force', async () => {
      const path = join(dir, '.env')
      writeFileSync(path, 'KEEP=me\n')
      await writeEnvFile(path, 'A=1', true)
      expect(readFileSync(path, 'utf8')).to.equal('A=1\n')
    })

    it('creates the file with owner-only permissions where the OS supports it', async function () {
      if (process.platform === 'win32') this.skip()
      const path = join(dir, '.env')
      await writeEnvFile(path, 'A=1', false)
      expect(statSync(path).mode & 0o777).to.equal(0o600)
      // An existing, looser file is tightened when overwritten.
      writeFileSync(path, 'x', {mode: 0o644})
      await writeEnvFile(path, 'A=2', true)
      expect(statSync(path).mode & 0o777).to.equal(0o600)
    })
  })

  describe('gitIgnoreStatus', () => {
    it('maps git check-ignore exit codes', async () => {
      expect(await gitIgnoreStatus('.env', '.', async () => 0)).to.equal('ignored')
      expect(await gitIgnoreStatus('.env', '.', async () => 1)).to.equal('not-ignored')
      expect(await gitIgnoreStatus('.env', '.', async () => 128)).to.equal('no-git')
      expect(await gitIgnoreStatus('.env', '.', async () => 'missing')).to.equal('no-git')
    })

    describe('with a real repository', () => {
      let dir: string

      before(function () {
        if (!hasGit()) this.skip()
        dir = mkdtempSync(join(tmpdir(), 'aoox-gitignore-'))
        execFileSync('git', ['init', '-q'], {cwd: dir})
        writeFileSync(join(dir, '.gitignore'), '.env\n*.secret\n')
        mkdirSync(join(dir, 'sub'))
      })

      after(() => {
        if (dir) rmSync(dir, {force: true, recursive: true})
      })

      it('knows ignored and not-ignored files', async () => {
        expect(await gitIgnoreStatus('.env', dir)).to.equal('ignored')
        expect(await gitIgnoreStatus('a.secret', dir)).to.equal('ignored')
        expect(await gitIgnoreStatus('.env.staging', dir)).to.equal('not-ignored')
        expect(await gitIgnoreStatus(join('sub', '.env'), dir)).to.equal('ignored')
      })

      it('says no-git outside a repository', async () => {
        const outside = mkdtempSync(join(tmpdir(), 'aoox-nogit-'))
        try {
          expect(await gitIgnoreStatus('.env', outside)).to.equal('no-git')
        } finally {
          rmSync(outside, {force: true, recursive: true})
        }
      })
    })
  })
})
