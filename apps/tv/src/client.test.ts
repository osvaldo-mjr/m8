import { PROTOCOL_VERSION } from '@m8/protocol'
import { describe, expect, it } from 'vitest'
import { determineHelloMessage } from './client.js'

describe('determineHelloMessage', () => {
  it('greets without a code when nothing was stored', () => {
    expect(determineHelloMessage(null)).toEqual({
      type: 'helloTable',
      protocolVersion: PROTOCOL_VERSION,
    })
  })

  it('rejoins the stored table when a code was stored', () => {
    expect(determineHelloMessage('KXTP')).toEqual({
      type: 'helloTable',
      protocolVersion: PROTOCOL_VERSION,
      code: 'KXTP',
    })
  })
})
