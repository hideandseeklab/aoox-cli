import {expect} from 'chai'

import {dockerEngineStatus, dockerUnavailableLines} from '../../src/lib/docker.js'

describe('docker engine status', () => {
  it('reports missing when docker is not in PATH', async () => {
    const path = process.env.PATH
    process.env.PATH = ''
    try {
      expect(await dockerEngineStatus()).to.equal('missing')
    } finally {
      process.env.PATH = path
    }
  })

  it('explains both failures in plain words', () => {
    expect(dockerUnavailableLines('unreachable')[0]).to.equal('Cannot connect to the Docker engine.')
    expect(dockerUnavailableLines('unreachable')[1]).to.contain('Start Docker Desktop')
    expect(dockerUnavailableLines('missing')[0]).to.contain('not installed')
  })
})
