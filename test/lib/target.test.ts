/* eslint-disable mocha/max-top-level-suites */
import {expect} from 'chai'

import {
  isUuid,
  NAMESPACE,
  type ProjectWithInstances,
  resolveByName,
  TargetError,
  targetRequest,
  ticketBody,
  ticketPath,
} from '../../src/lib/target.js'

const projects: ProjectWithInstances[] = [
  {
    id: 'p1',
    instances: [
      {id: 'a1', kind: 'application', name: 'web'},
      {id: 'd1', kind: 'database', name: 'main-db'},
      {id: 'c1', kind: 'compose', name: 'blog'},
    ],
    name: 'Shop',
  },
  {id: 'p2', instances: [{id: 'a2', kind: 'application', name: 'Web'}], name: 'Docs'},
]

describe('targetRequest', () => {
  it('maps each flag to its kind', () => {
    expect(targetRequest({app: ' web '})).to.deep.equal({kind: 'application', linked: false, ref: 'web'})
    expect(targetRequest({database: 'db'})).to.deep.equal({kind: 'database', linked: false, ref: 'db'})
    expect(targetRequest({stack: 'blog'})).to.deep.equal({kind: 'compose', linked: false, ref: 'blog'})
  })

  it('falls back to the linked application, then to nothing', () => {
    expect(targetRequest({}, 'app-1')).to.deep.equal({kind: 'application', linked: true, ref: 'app-1'})
    expect(targetRequest({})).to.equal(null)
  })

  it('a flag wins over the link', () => {
    expect(targetRequest({database: 'x'}, 'app-1')?.kind).to.equal('database')
  })
})

describe('resolveByName', () => {
  it('finds a name case-insensitively within the kind', () => {
    expect(resolveByName(projects, 'database', 'MAIN-db')).to.deep.include({id: 'd1', project: 'Shop'})
    expect(resolveByName(projects, 'compose', 'blog').id).to.equal('c1')
  })

  it('does not match another kind with the same name', () => {
    expect(() => resolveByName(projects, 'database', 'web')).to.throw(TargetError, /not found/)
  })

  it('reports an ambiguous name with the projects and the --project hint', () => {
    try {
      resolveByName(projects, 'application', 'web')
      expect.fail('should throw')
    } catch (error) {
      expect(error).to.be.instanceOf(TargetError)
      const {hints, message} = error as TargetError
      expect(message).to.match(/2 applications are named "web"/)
      expect(hints.join('\n')).to.include('Shop').and.include('Docs').and.include('--project')
    }
  })

  it('--project narrows by name or id', () => {
    expect(resolveByName(projects, 'application', 'web', 'docs').id).to.equal('a2')
    expect(resolveByName(projects, 'application', 'web', 'p1').id).to.equal('a1')
  })

  it('an unknown project lists the ones you can see', () => {
    try {
      resolveByName(projects, 'application', 'web', 'nope')
      expect.fail('should throw')
    } catch (error) {
      expect((error as TargetError).hints.join('')).to.include('Shop, Docs')
    }
  })

  it('lists what exists when nothing matches', () => {
    try {
      resolveByName(projects, 'application', 'api')
      expect.fail('should throw')
    } catch (error) {
      expect((error as TargetError).hints[0]).to.include('web')
    }
  })
})

describe('routes', () => {
  it('builds the ticket routes per kind and purpose', () => {
    expect(ticketPath('application', 'a', 'logs')).to.equal('/applications/a/log-ticket')
    expect(ticketPath('application', 'a', 'console')).to.equal('/applications/a/console-ticket')
    expect(ticketPath('database', 'd', 'logs')).to.equal('/databases/d/log-ticket')
    expect(ticketPath('database', 'd', 'console')).to.equal('/databases/d/console-ticket')
    expect(ticketPath('compose', 'c', 'logs')).to.equal('/compose-apps/c/log-ticket')
    expect(ticketPath('compose', 'c', 'console')).to.equal('/compose-apps/c/console-ticket')
  })

  it('only a stack sends a service', () => {
    expect(ticketBody('application', 'web')).to.equal(undefined)
    expect(ticketBody('database')).to.equal(undefined)
    expect(ticketBody('compose', 'web')).to.deep.equal({service: 'web'})
    expect(ticketBody('compose')).to.deep.equal({})
  })

  it('uses the gateway namespaces', () => {
    expect(NAMESPACE).to.deep.equal({console: '/console', logs: '/logs'})
  })

  it('recognises a UUID', () => {
    expect(isUuid('0b7e7f0e-8a43-4a58-9d8e-1a2b3c4d5e6f')).to.equal(true)
    expect(isUuid('web')).to.equal(false)
  })
})
