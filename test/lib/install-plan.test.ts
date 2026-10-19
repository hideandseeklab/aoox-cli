/* eslint-disable mocha/max-top-level-suites -- four small suites around one feature */
import {expect} from 'chai'
import {readFileSync} from 'node:fs'
import {mkdtemp, readFile, rm, stat, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {explicitOverrides, type InstallPlanInput, planInstall, wipeWarning} from '../../src/lib/install-plan.js'
import {
  backupInstallFiles,
  composeDefaults,
  composeVariables,
  mergeEnv,
  MissingSecretsError,
  parseEnv,
  repairDefaults,
} from '../../src/lib/reinstall.js'

const DIR = '/opt/aoox'
const base: InstallPlanInput = {
  composeExists: true,
  dir: DIR,
  envExists: true,
  force: false,
  hasSecrets: true,
  interactive: true,
  newSecrets: false,
  wipeData: false,
  yes: false,
}
const plan = (o: Partial<InstallPlanInput>) => planInstall({...base, ...o})
const empty = {composeExists: false, envExists: false, hasSecrets: false}

describe('planInstall', () => {
  describe('nothing installed yet', () => {
    it('is a fresh install, with or without --force', () => {
      expect(plan({...empty}).kind).to.equal('fresh')
      expect(plan({...empty, force: true}).kind).to.equal('fresh')
      expect(plan({...empty, force: true, newSecrets: true, wipeData: true}).kind).to.equal('fresh')
    })

    it('treats a stray .env.dist without a compose file as an existing install (it must be backed up)', () => {
      expect(plan({composeExists: false, force: true}).kind).to.equal('reuse')
      expect(plan({composeExists: false}).kind).to.equal('error')
    })
  })

  describe('existing install without --force', () => {
    it('refuses and points to reinstall / --force', () => {
      const p = plan({})
      expect(p.kind).to.equal('error')
      if (p.kind === 'error') {
        expect(p.message).to.contain('already exists')
        expect(p.suggestions.join(' ')).to.contain('aoox reinstall').and.contain('--force')
      }
    })

    it('refuses even with --yes', () => {
      expect(plan({yes: true}).kind).to.equal('error')
    })
  })

  describe('--force (reuse secrets)', () => {
    it('backs up and reuses, asking unless --yes', () => {
      expect(plan({force: true})).to.deep.equal({backup: true, confirm: 'prompt', kind: 'reuse'})
      expect(plan({force: true, yes: true})).to.deep.equal({backup: true, confirm: 'yes-flag', kind: 'reuse'})
    })

    it('works non-interactively with --yes', () => {
      expect(plan({force: true, interactive: false, yes: true}).kind).to.equal('reuse')
    })

    it('refuses when the existing .env.dist has no secrets, never inventing new ones', () => {
      const p = plan({force: true, hasSecrets: false})
      expect(p.kind).to.equal('error')
      if (p.kind === 'error') expect(p.suggestions.join(' ')).to.contain('--new-secrets --wipe-data')
    })
  })

  describe('flag combinations', () => {
    it('--new-secrets alone (the combination that broke the database) is refused with the reason', () => {
      const p = plan({force: true, newSecrets: true})
      expect(p.kind).to.equal('error')
      if (p.kind === 'error') expect(p.message).to.contain('cannot unlock the existing database')
      expect(plan({force: true, newSecrets: true, yes: true}).kind).to.equal('error')
    })

    it('--wipe-data alone is refused', () => {
      const p = plan({force: true, wipeData: true})
      expect(p.kind).to.equal('error')
      if (p.kind === 'error') expect(p.message).to.contain('half-reset')
    })

    it('--new-secrets / --wipe-data need --force', () => {
      expect(plan({newSecrets: true, wipeData: true}).kind).to.equal('error')
      expect(plan({wipeData: true}).kind).to.equal('error')
      expect(plan({newSecrets: true}).kind).to.equal('error')
    })

    it('--confirm-wipe without the full set is refused (also on a fresh dir)', () => {
      expect(plan({confirmWipe: DIR, force: true}).kind).to.equal('error')
      expect(plan({...empty, confirmWipe: DIR}).kind).to.equal('error')
    })
  })

  describe('--force --new-secrets --wipe-data', () => {
    const wipe = {force: true, newSecrets: true, wipeData: true}

    it('--yes alone is NOT enough, interactive or not', () => {
      expect(plan({...wipe, interactive: false, yes: true}).kind).to.equal('error')
      // interactive: the typed path is still required, --yes does not skip it
      expect(plan({...wipe, yes: true})).to.deep.equal({backup: true, confirm: 'typed', kind: 'wipe'})
    })

    it('non-interactive without --confirm-wipe explains how', () => {
      const p = plan({...wipe, interactive: false})
      expect(p.kind).to.equal('error')
      if (p.kind === 'error') expect(p.suggestions.join(' ')).to.contain(`--confirm-wipe=${DIR}`)
    })

    it('interactive asks for the typed path', () => {
      expect(plan(wipe)).to.deep.equal({backup: true, confirm: 'typed', kind: 'wipe'})
    })

    it('--confirm-wipe equal to the dir is accepted non-interactively', () => {
      expect(plan({...wipe, confirmWipe: DIR, interactive: false})).to.deep.equal({backup: true, confirm: 'flag', kind: 'wipe'})
    })

    it('a different --confirm-wipe is rejected', () => {
      const p = plan({...wipe, confirmWipe: '/tmp/other'})
      expect(p.kind).to.equal('error')
      if (p.kind === 'error') expect(p.message).to.contain(DIR)
    })

    it('does not require existing secrets (a broken install can still be wiped)', () => {
      expect(plan({...wipe, confirmWipe: DIR, hasSecrets: false}).kind).to.equal('wipe')
    })
  })

  it('wipeWarning names the folder and what is lost', () => {
    const text = wipeWarning(DIR).join('\n')
    expect(text).to.contain(DIR).and.contain('DELETE').and.contain('down -v').and.contain('credential')
  })
})

describe('explicitOverrides', () => {
  it('only contains what was passed', () => {
    expect(explicitOverrides({})).to.deep.equal({})
    expect(explicitOverrides({terminalSshUser: 'ubuntu'})).to.deep.equal({TERMINAL_SSH_USER: 'ubuntu'})
  })

  it('domain mode sets hosts and https origins', () => {
    expect(explicitOverrides({acmeEmail: 'a@b.c', apiDomain: 'api.x.dev', webDomain: 'x.dev'})).to.deep.equal({
      API_DOMAIN: 'api.x.dev',
      PROXY_ACME_EMAIL: 'a@b.c',
      PUBLIC_API_URL: 'https://api.x.dev',
      WEB_DOMAIN: 'x.dev',
      WEB_ORIGIN: 'https://x.dev',
    })
  })
})

describe('--force env reuse (mergeEnv with explicit overrides)', () => {
  const compose = readFileSync('assets/install/docker-compose.dist.yml', 'utf8')
  const defaults = repairDefaults(composeVariables(compose), {dockerGid: '998', installDir: DIR}, composeDefaults(compose))
  const old = [
    'POSTGRES_PASSWORD=pg-old',
    'JWT_SECRET=jwt-old',
    'ENCRYPTION_KEY=enc-old',
    'WEB_ORIGIN=https://panel.x.dev',
    'CUSTOM=keep',
    'TERMINAL_SSH_USER=ubuntu',
    '',
  ].join('\n')

  it('keeps every secret and existing value byte for byte', () => {
    const m = mergeEnv(old, defaults, explicitOverrides({}))
    const v = parseEnv(m.content)
    expect(v.get('POSTGRES_PASSWORD')).to.equal('pg-old')
    expect(v.get('JWT_SECRET')).to.equal('jwt-old')
    expect(v.get('ENCRYPTION_KEY')).to.equal('enc-old')
    expect(v.get('WEB_ORIGIN')).to.equal('https://panel.x.dev')
    expect(v.get('CUSTOM')).to.equal('keep')
    expect(v.get('TERMINAL_SSH_USER')).to.equal('ubuntu')
    expect(m.content.startsWith(old)).to.equal(true)
  })

  it('an explicit flag replaces only its own key', () => {
    const m = mergeEnv(old, defaults, explicitOverrides({terminalSshUser: 'root'}))
    expect(parseEnv(m.content).get('TERMINAL_SSH_USER')).to.equal('root')
    expect(parseEnv(m.content).get('POSTGRES_PASSWORD')).to.equal('pg-old')
  })

  it('throws instead of inventing a missing secret', () => {
    expect(() => mergeEnv('JWT_SECRET=a\n', defaults)).to.throw(MissingSecretsError)
  })
})

describe('backupInstallFiles', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'aoox-install-'))
  })

  afterEach(async () => {
    await rm(dir, {force: true, recursive: true})
  })

  it('copies .env.dist and the compose files that exist, skips the absent ones', async () => {
    await writeFile(join(dir, '.env.dist'), 'POSTGRES_PASSWORD=x\n')
    await writeFile(join(dir, 'docker-compose.dist.yml'), 'name: aoox\n')
    const backup = join(dir, 'backups', 't1')
    const copied = await backupInstallFiles(dir, backup, ['docker-compose.dist.yml', 'docker-compose.domain.yml'])
    expect(copied).to.have.members(['.env.dist', 'docker-compose.dist.yml'])
    expect(await readFile(join(backup, '.env.dist'), 'utf8')).to.equal('POSTGRES_PASSWORD=x\n')
    let missing = false
    try {
      await stat(join(backup, 'docker-compose.domain.yml'))
    } catch {
      missing = true
    }

    expect(missing).to.equal(true)
  })
})
