import {expect} from 'chai'

import {buildEnvFile} from '../../src/lib/install-env.js'

const base = {
  dockerGid: '999',
  encryptionKey: 'enc',
  jwtSecret: 'jwt',
  postgresPassword: 'pg',
  publicApiUrl: 'http://1.2.3.4:3001',
  webOrigin: 'http://1.2.3.4:3000',
}

describe('buildEnvFile', () => {
  it('fills in every generated secret and the detected origin/API URL', () => {
    const env = buildEnvFile(base)
    expect(env).to.include('POSTGRES_PASSWORD=pg')
    expect(env).to.include('JWT_SECRET=jwt')
    expect(env).to.include('ENCRYPTION_KEY=enc')
    expect(env).to.include('WEB_ORIGIN=http://1.2.3.4:3000')
    expect(env).to.include('PUBLIC_API_URL=http://1.2.3.4:3001')
    expect(env).to.include('DOCKER_GID=999')
  })

  it('leaves optional fields blank rather than "undefined" when omitted', () => {
    const env = buildEnvFile(base)
    expect(env).to.include('PUBLIC_IP=\n')
    expect(env).to.include('WEB_DOMAIN=\n')
    expect(env).to.include('ADMIN_EMAIL=\n')
    expect(env).to.not.include('undefined')
  })

  it('carries domain/ACME/admin fields through when given', () => {
    const env = buildEnvFile({
      ...base,
      acmeEmail: 'me@example.com',
      adminEmail: 'admin@example.com',
      adminName: 'Admin',
      adminPassword: 'hunter22',
      apiDomain: 'api.example.com',
      publicIp: '1.2.3.4',
      webDomain: 'panel.example.com',
    })
    expect(env).to.include('WEB_DOMAIN=panel.example.com')
    expect(env).to.include('API_DOMAIN=api.example.com')
    expect(env).to.include('PROXY_ACME_EMAIL=me@example.com')
    expect(env).to.include('ADMIN_EMAIL=admin@example.com')
    expect(env).to.include('ADMIN_PASSWORD=hunter22')
    expect(env).to.include('ADMIN_NAME=Admin')
    expect(env).to.include('PUBLIC_IP=1.2.3.4')
  })
})
