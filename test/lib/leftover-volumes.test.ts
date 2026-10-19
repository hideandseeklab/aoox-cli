/* eslint-disable mocha/max-top-level-suites -- small suites around one feature */
import {expect} from 'chai'
import {readFileSync} from 'node:fs'
import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {type InstallPlanInput, planInstall} from '../../src/lib/install-plan.js'
import {composeProjectName, declaredVolumeNames, latestEnvBackup, leftoverVolumes} from '../../src/lib/leftover-volumes.js'

const bundled = readFileSync(new URL('../../assets/install/docker-compose.dist.yml', import.meta.url), 'utf8')

describe('declaredVolumeNames', () => {
  it('reads the volumes of the bundled compose file with the project prefix', () => {
    expect(composeProjectName(bundled)).to.equal('aoox')
    expect(declaredVolumeNames(bundled)).to.deep.equal(['aoox_postgres_data'])
  })

  it('honours an explicit name and skips external volumes and later top-level keys', () => {
    const compose = [
      'name: panel',
      'services:',
      '  a:',
      '    volumes: [x:/x]',
      'volumes:',
      '  data:',
      '  pinned:',
      '    name: fixed_name',
      '  shared:',
      '    external: true',
      'networks:',
      '  net:',
      '    name: net',
    ].join('\n')
    expect(declaredVolumeNames(compose)).to.deep.equal(['panel_data', 'fixed_name'])
  })

  it('is empty without a volumes block', () => {
    expect(declaredVolumeNames('services:\n  a:\n    image: x\n')).to.deep.equal([])
  })
})

describe('leftoverVolumes', () => {
  it('keeps only the declared volumes that exist', () => {
    expect(leftoverVolumes(['aoox_postgres_data', 'aoox_other'], ['aoox_postgres_data', 'unrelated'])).to.deep.equal(['aoox_postgres_data'])
    expect(leftoverVolumes(['aoox_postgres_data'], [])).to.deep.equal([])
  })
})

describe('latestEnvBackup', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'aoox-backups-'))
  })

  afterEach(async () => {
    await rm(dir, {force: true, recursive: true})
  })

  it('returns the newest backup folder that holds a .env.dist', async () => {
    await mkdir(`${dir}/backups/2026-01-01T00-00-00-000Z`, {recursive: true})
    await mkdir(`${dir}/backups/2026-02-01T00-00-00-000Z`, {recursive: true})
    await mkdir(`${dir}/backups/2026-03-01T00-00-00-000Z`, {recursive: true})
    await writeFile(`${dir}/backups/2026-01-01T00-00-00-000Z/.env.dist`, 'A=1')
    await writeFile(`${dir}/backups/2026-02-01T00-00-00-000Z/.env.dist`, 'A=2')
    expect(await latestEnvBackup(dir)).to.equal(`${dir}/backups/2026-02-01T00-00-00-000Z`)
  })

  it('is undefined without a backups folder', async () => {
    expect(await latestEnvBackup(dir)).to.equal(undefined)
  })
})

describe('planInstall with a leftover database volume', () => {
  const DIR = '/opt/aoox'
  const base: InstallPlanInput = {
    composeExists: false,
    dir: DIR,
    envExists: false,
    force: false,
    hasSecrets: false,
    interactive: true,
    leftoverVolumes: ['aoox_postgres_data'],
    newSecrets: false,
    wipeData: false,
    yes: false,
  }

  it('refuses a plain install and offers restore or an explicit wipe', () => {
    const p = planInstall(base)
    expect(p.kind).to.equal('error')
    if (p.kind !== 'error') return
    expect(p.message).to.contain('aoox_postgres_data')
    expect(p.message).to.contain('Nothing was changed')
    expect(p.suggestions.join('\n')).to.contain('aoox reinstall')
    expect(p.suggestions.join('\n')).to.contain('--force --new-secrets --wipe-data')
  })

  it('points at the newest backup when there is one', () => {
    const p = planInstall({...base, latestBackup: '/opt/aoox/backups/2026-02-01'})
    if (p.kind !== 'error') throw new Error('expected an error')
    expect(p.suggestions[0]).to.contain('cp /opt/aoox/backups/2026-02-01/.env.dist /opt/aoox/.env.dist')
  })

  it('refuses --yes and --force alone as well', () => {
    expect(planInstall({...base, yes: true}).kind).to.equal('error')
    expect(planInstall({...base, force: true}).kind).to.equal('error')
  })

  it('wipes only with the explicit flags and a confirmation', () => {
    const wipe = {...base, force: true, newSecrets: true, wipeData: true}
    expect(planInstall(wipe).kind).to.equal('wipe')
    expect(planInstall({...wipe, confirmWipe: DIR})).to.deep.include({confirm: 'flag', kind: 'wipe'})
    expect(planInstall({...wipe, interactive: false}).kind).to.equal('error')
    expect(planInstall({...wipe, confirmWipe: '/elsewhere'}).kind).to.equal('error')
  })

  it('stays a fresh install when nothing is left over', () => {
    expect(planInstall({...base, leftoverVolumes: []}).kind).to.equal('fresh')
    expect(planInstall({...base, leftoverVolumes: undefined}).kind).to.equal('fresh')
  })
})
