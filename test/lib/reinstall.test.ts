import {expect} from 'chai'
import {readFileSync} from 'node:fs'

import {
  chooseComposeFiles,
  composeArgs,
  composeDefaults,
  composeVariables,
  mergeEnv,
  MissingSecretsError,
  parseEnv,
  repairDefaults,
  runningFileNames,
  summarizeDiff,
} from '../../src/lib/reinstall.js'

const compose = readFileSync('assets/install/docker-compose.dist.yml', 'utf8')
const defaults = () =>
  repairDefaults(composeVariables(compose), {dockerGid: '998', installDir: '/opt/aoox'}, composeDefaults(compose))

const OLD_ENV = [
  '# my own comment',
  'POSTGRES_PASSWORD=pgsecret',
  'JWT_SECRET=jwtsecret',
  'ENCRYPTION_KEY=enckey',
  '',
  'WEB_ORIGIN=https://panel.example.com',
  'CUSTOM_THING=keep-me',
  'WEB_PORT=3000',
  '',
].join('\n')

describe('reinstall helpers', () => {
describe('parseEnv', () => {
  it('ignores comments, keeps last duplicate, allows empty values', () => {
    const m = parseEnv('# A=1\nA=2\nA=3\nB=\n  C=x')
    expect(m.get('A')).to.equal('3')
    expect(m.get('B')).to.equal('')
    expect(m.get('C')).to.equal('x')
  })
})

describe('repairDefaults', () => {
  it('only offers safe keys the compose reads — never secrets or per-install values', () => {
    const d = defaults()
    expect(d.get('TERMINAL_SSH_USER')).to.equal('root')
    expect(d.get('INSTALL_DIR')).to.equal('/opt/aoox')
    expect(d.get('DOCKER_GID')).to.equal('998')
    // values equal to the compose fallback are noise, not repairs
    for (const k of ['REGISTRY_PORT', 'PROXY_HTTP_PORT', 'TERMINAL_SSH_PASSWORD', 'COOKIE_SECURE']) expect(d.has(k), k).to.equal(false)
    for (const k of ['POSTGRES_PASSWORD', 'JWT_SECRET', 'ENCRYPTION_KEY', 'WEB_ORIGIN', 'PUBLIC_API_URL', 'WEB_DOMAIN', 'PUBLIC_IP', 'ADMIN_EMAIL']) {
      expect(d.has(k), k).to.equal(false)
    }
  })
})

describe('mergeEnv', () => {
  it('keeps every existing line byte for byte and appends missing keys', () => {
    const r = mergeEnv(OLD_ENV, defaults(), {}, 'T')
    expect(r.content.startsWith(OLD_ENV)).to.equal(true)
    expect(r.added).to.include('TERMINAL_SSH_USER')
    expect(r.added).to.include('INSTALL_DIR')
    expect(parseEnv(r.content).get('INSTALL_DIR')).to.equal('/opt/aoox')
    expect(r.added).to.not.include('WEB_PORT')
    expect(r.added).to.not.include('WEB_ORIGIN')
    const merged = parseEnv(r.content)
    expect(merged.get('POSTGRES_PASSWORD')).to.equal('pgsecret')
    expect(merged.get('JWT_SECRET')).to.equal('jwtsecret')
    expect(merged.get('ENCRYPTION_KEY')).to.equal('enckey')
    expect(merged.get('CUSTOM_THING')).to.equal('keep-me')
    expect(merged.get('WEB_ORIGIN')).to.equal('https://panel.example.com')
    expect(merged.get('TERMINAL_SSH_USER')).to.equal('root')
  })

  it('is idempotent: a second merge changes nothing', () => {
    const first = mergeEnv(OLD_ENV, defaults(), {}, 'T')
    const second = mergeEnv(first.content, defaults(), {}, 'T2')
    expect(second.added).to.deep.equal([])
    expect(second.content).to.equal(first.content)
  })

  it('does not treat a commented-out key as present', () => {
    const r = mergeEnv(`${OLD_ENV}# TERMINAL_SSH_USER=deploy\n`, defaults(), {}, 'T')
    expect(r.added).to.include('TERMINAL_SSH_USER')
  })

  it('handles a file without trailing newline', () => {
    const r = mergeEnv(OLD_ENV.trimEnd(), defaults(), {}, 'T')
    expect(parseEnv(r.content).get('TERMINAL_SSH_USER')).to.equal('root')
    expect(parseEnv(r.content).get('WEB_PORT')).to.equal('3000')
  })

  it('refuses when a required secret is missing or blank', () => {
    for (const drop of ['POSTGRES_PASSWORD', 'JWT_SECRET', 'ENCRYPTION_KEY']) {
      const broken = OLD_ENV.replace(new RegExp(`^${drop}=.*$`, 'm'), drop === 'JWT_SECRET' ? `${drop}=` : '')
      expect(() => mergeEnv(broken, defaults())).to.throw(MissingSecretsError, drop)
    }
  })

  it('override replaces an existing value in place, or adds a missing key', () => {
    const withUser = `${OLD_ENV}TERMINAL_SSH_USER=ubuntu\n`
    const r = mergeEnv(withUser, defaults(), {TERMINAL_SSH_USER: 'root'}, 'T')
    expect(r.overridden).to.deep.equal(['TERMINAL_SSH_USER'])
    expect(parseEnv(r.content).get('TERMINAL_SSH_USER')).to.equal('root')
    expect(r.content).to.not.include('ubuntu')

    const added = mergeEnv(OLD_ENV, defaults(), {TERMINAL_SSH_USER: 'deploy'}, 'T')
    expect(parseEnv(added.content).get('TERMINAL_SSH_USER')).to.equal('deploy')
    expect(added.added).to.include('TERMINAL_SSH_USER')
  })

  it('warns when TERMINAL_SSH_USER is present but blank', () => {
    const r = mergeEnv(`${OLD_ENV}TERMINAL_SSH_USER=\n`, defaults(), {}, 'T')
    expect(r.warnings.join(' ')).to.include('TERMINAL_SSH_USER')
  })
})

describe('chooseComposeFiles', () => {
  const dist = 'docker-compose.dist.yml'
  const domain = 'docker-compose.domain.yml'
  const override = 'docker-compose.override.yml'

  it('falls back to dist only', () => {
    expect(chooseComposeFiles({present: [dist]})).to.deep.equal([dist])
  })

  it('fallback adds the override explicitly when it exists (Compose will not auto-include it)', () => {
    expect(chooseComposeFiles({present: [dist, override]})).to.deep.equal([dist, override])
    expect(chooseComposeFiles({present: [dist, domain, override]})).to.deep.equal([dist, domain, override])
  })

  it('prefers the exact set the running stack was started with', () => {
    const running = `/opt/aoox/${dist},/opt/aoox/${override}`
    expect(chooseComposeFiles({present: [dist, domain, override], runningConfigFiles: running})).to.deep.equal([dist, override])
  })

  it('drops running files that no longer exist and keeps dist first', () => {
    const running = `/opt/aoox/${override},/opt/aoox/${dist}`
    expect(chooseComposeFiles({present: [dist], runningConfigFiles: running})).to.deep.equal([dist])
    expect(chooseComposeFiles({present: [dist, override], runningConfigFiles: running})).to.deep.equal([dist, override])
  })

  it('keeps extra files the stack runs with (e.g. the build override), in original order', () => {
    const build = 'docker-compose.build.yml'
    const running = `/opt/aoox/${dist},/opt/aoox/${build},/opt/aoox/${override}`
    expect(chooseComposeFiles({present: [dist, build, override], runningConfigFiles: running})).to.deep.equal([dist, build, override])
    expect(runningFileNames(running)).to.deep.equal([dist, build, override])
  })

  it('ignores a running list that does not include dist', () => {
    expect(chooseComposeFiles({present: [dist, override], runningConfigFiles: '/x/other.yml'})).to.deep.equal([dist, override])
  })
})

describe('composeArgs / summarizeDiff', () => {
  it('builds the compose invocation', () => {
    expect(composeArgs(['a.yml', 'b.yml'], 'up', '-d')).to.deep.equal([
      'compose', '-f', 'a.yml', '-f', 'b.yml', '--env-file', '.env.dist', 'up', '-d',
    ])
  })

  it('reports added and removed lines, ignoring blank ones in the preview', () => {
    const d = summarizeDiff('a\nb\nc\n', 'a\nc\nd\n')
    expect(d.lines).to.deep.equal(['- b', '+ d'])
    expect(d.removed).to.equal(1)
    expect(d.added).to.equal(1)
    expect(summarizeDiff('same\n', 'same\n').lines).to.deep.equal([])
  })
})

})
