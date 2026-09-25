import {expect} from 'chai'
import {readFileSync} from 'node:fs'

import {buildEnvFile} from '../../src/lib/install-env.js'

/**
 * Guards the drift `assets/install/README.md` warns about: every `${VAR}`
 * the bundled compose files read must either be written by `buildEnvFile`
 * or have its own `:-default`/`:?message` fallback in the compose file
 * itself (checked against the *bundled* copy, so a stale copy that adds a
 * required var without updating this list fails here, not on a VPS).
 */
describe('assets/install compose vs buildEnvFile coverage', () => {
  // Vars the compose files default or set outside .env.dist on purpose
  // (see install-env.ts and .env.dist.example: pinned image overrides and
  // JWT expiry are advanced, commented-out-by-default options).
  const intentionallyOmitted = new Set(['API_IMAGE', 'JWT_EXPIRES_IN', 'WEB_IMAGE'])

  it('does not leave a compose variable unwritten', () => {
    const compose = readFileSync('assets/install/docker-compose.dist.yml', 'utf8')
    const domainCompose = readFileSync('assets/install/docker-compose.domain.yml', 'utf8')
    const referenced = new Set<string>()
    for (const text of [compose, domainCompose]) {
      for (const m of text.matchAll(/\$\{([A-Z_][A-Z0-9_]*)(?::[?-][^}]*)?\}/g)) referenced.add(m[1])
    }

    const env = buildEnvFile({
      dockerGid: '0',
      encryptionKey: 'x',
      jwtSecret: 'x',
      postgresPassword: 'x',
      publicApiUrl: 'http://x:3001',
      webOrigin: 'http://x:3000',
    })
    const written = new Set(
      env
        .split('\n')
        .map((l) => /^([A-Z_][A-Z0-9_]*)=/.exec(l)?.[1])
        .filter(Boolean),
    )

    const missing = [...referenced].filter((v) => !written.has(v) && !intentionallyOmitted.has(v))
    expect(missing, `compose references these but buildEnvFile never writes them: ${missing.join(', ')}`).to.be.empty
  })
})
