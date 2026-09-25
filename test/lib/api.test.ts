import {expect} from 'chai'

import {messageFromBody} from '../../src/lib/api.js'

describe('messageFromBody', () => {
  it('reads the NestJS error message', () => {
    expect(messageFromBody({error: 'Unauthorized', message: 'Invalid token', statusCode: 401}, 'x')).to.equal(
      'Invalid token',
    )
  })

  it('joins ValidationPipe messages', () => {
    expect(messageFromBody({message: ['name must be a string', 'port must be an integer']}, 'x')).to.equal(
      'name must be a string; port must be an integer',
    )
  })

  it('falls back when the body carries nothing useful', () => {
    expect(messageFromBody({}, 'fallback')).to.equal('fallback')
    expect(messageFromBody(undefined, 'fallback')).to.equal('fallback')
    expect(messageFromBody({message: '   '}, 'fallback')).to.equal('fallback')
  })

  it('accepts a plain string body (proxy or wrong URL)', () => {
    expect(messageFromBody('<html>502</html>', 'fallback')).to.equal('<html>502</html>')
  })
})
