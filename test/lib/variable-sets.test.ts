/* eslint-disable no-template-curly-in-string */
import {expect} from 'chai'

import type {LinkView} from '../../src/lib/types.js'

import {checkEnvFile} from '../../src/lib/env-text.js'
import {
  addLink,
  describeLinks,
  findLink,
  findSet,
  mergeForRun,
  pickEnvironment,
  pickSet,
  projectReferenceKeys,
  removeLink,
  SelectionError,
} from '../../src/lib/variable-sets.js'

const env = (id: string, name: string) => ({id, name})
const shared = {environments: [env('e1', 'development'), env('e2', 'staging'), env('e3', 'production')], id: 's1', name: 'Shared', slug: 'shared'}
const payments = {environments: [env('p1', 'development'), env('p3', 'production')], id: 's2', name: 'Payments API', slug: 'payments'}
const sets = [shared, payments]

function link([setId, setSlug]: [string, string], [environmentId, environmentName]: [string, string], position: number, extra: Partial<LinkView> = {}): LinkView {
  return {
    environmentId,
    environmentName,
    keys: [],
    overriddenByOwnEnv: [],
    position,
    protected: false,
    setId,
    setName: setSlug,
    setSlug,
    shadowedKeys: [],
    ...extra,
  }
}

function selectionError(fn: () => unknown): SelectionError {
  try {
    fn()
  } catch (error) {
    if (error instanceof SelectionError) return error
    throw error
  }

  throw new Error('expected a SelectionError')
}

describe('variable sets (CLI helpers)', () => {
  describe('findSet / pickSet', () => {
    it('finds by slug, id or case-insensitive name', () => {
      expect(findSet(sets, 'payments')).to.equal(payments)
      expect(findSet(sets, 's1')).to.equal(shared)
      expect(findSet(sets, 'payments api')).to.equal(payments)
      expect(findSet(sets, 'nope')).to.equal(undefined)
    })

    it('--set wins; an unknown one lists the visible slugs', () => {
      expect(pickSet(sets, 'shared', [link(['s2', 'payments'], ['p1', 'development'], 0)])).to.equal(shared)
      const e = selectionError(() => pickSet(sets, 'other'))
      expect(e.message).to.equal('Variable set "other" not found.')
      expect(e.hints).to.deep.equal(['Sets you can see: shared, payments'])
    })

    it('defaults to the only set the linked app links (even with two environments of it)', () => {
      const links = [link(['s2', 'payments'], ['p1', 'development'], 0), link(['s2', 'payments'], ['p3', 'production'], 1)]
      expect(pickSet(sets, undefined, links)).to.equal(payments)
    })

    it('never guesses between several linked sets', () => {
      const links = [link(['s1', 'shared'], ['e3', 'production'], 0), link(['s2', 'payments'], ['p3', 'production'], 1)]
      const e = selectionError(() => pickSet(sets, undefined, links))
      expect(e.message).to.match(/several variable sets; choose one with --set/)
      expect(e.hints).to.deep.equal(['Linked sets: shared, payments'])
    })

    it('without links: the only visible set, else an error listing them', () => {
      expect(pickSet([shared], undefined, [])).to.equal(shared)
      expect(selectionError(() => pickSet(sets, undefined, [])).hints).to.deep.equal(['Sets: shared, payments'])
      expect(selectionError(() => pickSet([])).message).to.equal('No variable set is shared with you.')
    })
  })

  describe('pickEnvironment', () => {
    it('--env wins; an unknown one lists the environments', () => {
      expect(pickEnvironment(shared, 'staging')).to.deep.equal(env('e2', 'staging'))
      const e = selectionError(() => pickEnvironment(shared, 'qa'))
      expect(e.message).to.equal('Set "shared" has no environment "qa".')
      expect(e.hints).to.deep.equal(['Environments: development, staging, production'])
    })

    it('defaults to the only linked environment of that set; there is no default name', () => {
      const links = [link(['s1', 'shared'], ['e3', 'production'], 0), link(['s2', 'payments'], ['p1', 'development'], 1)]
      expect(pickEnvironment(shared, undefined, links)).to.deep.equal(env('e3', 'production'))
      expect(selectionError(() => pickEnvironment(shared, undefined, [])).message).to.equal(
        'Choose an environment of "shared" with --env <name>.',
      )
    })

    it('refuses to guess between two linked environments of one set', () => {
      const links = [link(['s1', 'shared'], ['e2', 'staging'], 0), link(['s1', 'shared'], ['e3', 'production'], 1)]
      expect(selectionError(() => pickEnvironment(shared, undefined, links)).message).to.match(/several environments of "shared"/)
    })
  })

  describe('addLink / removeLink / findLink', () => {
    const list = [{environmentId: 'a'}, {environmentId: 'b'}]

    it('appends by default (the new link wins) and inserts at a 1-based position', () => {
      expect(addLink(list, 'c')).to.deep.equal([{environmentId: 'a'}, {environmentId: 'b'}, {environmentId: 'c'}])
      expect(addLink(list, 'c', 1)).to.deep.equal([{environmentId: 'c'}, {environmentId: 'a'}, {environmentId: 'b'}])
      expect(addLink(list, 'c', 2)).to.deep.equal([{environmentId: 'a'}, {environmentId: 'c'}, {environmentId: 'b'}])
    })

    it('moves an environment that is already linked', () => {
      expect(addLink(list, 'a')).to.deep.equal([{environmentId: 'b'}, {environmentId: 'a'}])
      expect(addLink(list, 'b', 1)).to.deep.equal([{environmentId: 'b'}, {environmentId: 'a'}])
    })

    it('checks the position and the limit of 10', () => {
      expect(selectionError(() => addLink(list, 'c', 4)).message).to.equal('--position must be between 1 and 3.')
      expect(selectionError(() => addLink(list, 'c', 0)).message).to.equal('--position must be between 1 and 3.')
      const ten = Array.from({length: 10}, (_, i) => ({environmentId: String(i)}))
      expect(selectionError(() => addLink(ten, 'x')).message).to.equal('At most 10 environments can be linked.')
      expect(addLink(ten, '3', 1)[0]).to.deep.equal({environmentId: '3'})
    })

    it('removes, and refuses an environment that is not linked', () => {
      expect(removeLink(list, 'a')).to.deep.equal([{environmentId: 'b'}])
      expect(selectionError(() => removeLink(list, 'z')).message).to.equal('That environment is not linked.')
    })

    it('finds a link by position (in position order) or by set and environment', () => {
      const links = [link(['s2', 'payments'], ['p3', 'production'], 1), link(['s1', 'shared'], ['e3', 'production'], 0)]
      expect(findLink(links, {position: 1}).environmentId).to.equal('e3')
      expect(findLink(links, {env: 'production', set: 'payments'}).environmentId).to.equal('p3')
      expect(selectionError(() => findLink(links, {position: 3})).message).to.equal('There is no link at position 3.')
      expect(selectionError(() => findLink(links, {env: 'staging', set: 'shared'})).message).to.equal('shared/staging is not linked.')
    })
  })

  describe('describeLinks', () => {
    it('prints 1-based positions in order with the conflict hints', () => {
      const lines = describeLinks('Application "web"', [
        link(['s2', 'payments'], ['p3', 'production'], 1, {keys: ['A', 'B'], overriddenByOwnEnv: ['B'], protected: true}),
        link(['s1', 'shared'], ['e3', 'production'], 0, {keys: ['A'], shadowedKeys: ['A']}),
      ])
      expect(lines).to.deep.equal([
        'Application "web": linked environments, in merge order (a later one wins; the own env wins over all)',
        '  1. shared/production  1 variable',
        '     overridden by a later link: A',
        '  2. payments/production (protected)  2 variables',
        '     overridden by the own env: B',
        'Changes take effect on the next deploy.',
      ])
    })

    it('says so when nothing is linked', () => {
      expect(describeLinks('Stack "blog"', [])[0]).to.equal('Stack "blog" links no variable set environment: it only gets its own env.')
    })
  })

  describe('mergeForRun (aoox run)', () => {
    it('later links win, the own env wins over all', () => {
      const r = mergeForRun(
        [
          {label: 'shared/production', text: 'A=1\nB=1\nC=1'},
          {label: 'payments/production', text: 'B=2\nC=2'},
        ],
        'C=own',
      )
      expect(r.env).to.deep.equal({A: '1', B: '2', C: 'own'})
      expect(r.unresolved).to.deep.equal([])
      expect(r.unknownVars).to.deep.equal([])
    })

    it('expands ${{vars.KEY}} one level from the merged sets (not from the own env)', () => {
      const r = mergeForRun(
        [
          {label: 'a', text: 'HOST=db.internal\nURL=https://${{vars.HOST}}'},
          {label: 'b', text: 'HOST=db.prod'},
        ],
        'HOST=own\nFULL=${{vars.URL}}\nH=${{ vars.HOST }}',
      )
      expect(r.env.URL).to.equal('https://db.prod')
      // One level: FULL receives URL as written in the set.
      expect(r.env.FULL).to.equal('https://${{vars.HOST}}')
      // The set value, not the own env's HOST.
      expect(r.env.H).to.equal('db.prod')
      expect(r.env.HOST).to.equal('own')
    })

    it('leaves database, secret and unknown vars references as written and reports them', () => {
      const r = mergeForRun([{label: 'a', text: 'DB=${{database.main.url}}\nTOKEN=${{secret.API_TOKEN}}'}], 'X=${{vars.MISSING}}\nY=plain')
      expect(r.env).to.deep.equal({
        DB: '${{database.main.url}}',
        TOKEN: '${{secret.API_TOKEN}}',
        X: '${{vars.MISSING}}',
        Y: 'plain',
      })
      expect(r.unresolved).to.deep.equal(['DB', 'TOKEN'])
      expect(r.unknownVars).to.deep.equal(['X'])
    })

    it('keeps $ in substituted values literal', () => {
      expect(mergeForRun([{label: 'a', text: 'P=a$&b$1'}], 'Q=${{vars.P}}').env.Q).to.equal('a$&b$1')
    })
  })

  describe('${{project.…}} (renamed to ${{vars.…}})', () => {
    it('is found in values and refused by env push', () => {
      expect(projectReferenceKeys('A=${{project.B}}\nC=${{vars.B}}\nD=${{ project.X }}')).to.deep.equal(['A', 'D'])
      expect(checkEnvFile('A=${{project.B}}').problems).to.deep.equal(['Line 1: A uses ${{project.…}}, which was renamed to ${{vars.…}}'])
    })
  })
})
