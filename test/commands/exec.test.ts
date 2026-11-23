import {runCommand} from '@oclif/test'
import {expect} from 'chai'

describe('aoox exec / logs argument handling', () => {
  it('exec refuses to run without a terminal', async () => {
    // mocha runs with piped stdio, so stdin/stdout are not TTYs here.
    const {error, stderr} = await runCommand(['exec', '--app', 'web'], {root: process.cwd()})
    expect(error?.oclif?.exit).to.equal(1)
    expect(stderr).to.match(/interactive terminal/i)
  })

  it('--app, --database and --stack are mutually exclusive', async () => {
    const {error} = await runCommand(['logs', '--app', 'a', '--database', 'b'], {root: process.cwd()})
    expect(error?.message ?? '').to.match(/cannot also be provided|exclusive/i)
  })

  it('--service needs --stack', async () => {
    const {error} = await runCommand(['logs', '--app', 'a', '--service', 'web'], {root: process.cwd()})
    expect(error?.message ?? '').to.match(/--stack/)
  })

  it('--deployment cannot be combined with --tail', async () => {
    const {error} = await runCommand(['logs', '--deployment', 'latest', '--tail', '5'], {root: process.cwd()})
    expect(error?.message ?? '').to.match(/cannot also be provided|exclusive/i)
  })
})
