import { PROTOCOL_VERSION } from '@m8/protocol'
import { describe, expect, it } from 'vitest'
import { codeFromLocation, determineHelloMessage, determineTokenToStore } from './client.js'

describe('codeFromLocation', () => {
  it('reads the code from the root path', () => {
    expect(codeFromLocation('/KXTP')).toBe('KXTP')
  })

  it('uppercases a lowercase code', () => {
    expect(codeFromLocation('/kxtp')).toBe('KXTP')
  })

  it('tolerates a trailing slash', () => {
    expect(codeFromLocation('/KXTP/')).toBe('KXTP')
  })

  it('returns null for the bare root', () => {
    expect(codeFromLocation('/')).toBeNull()
  })

  it('returns null for a path that is not a code', () => {
    expect(codeFromLocation('/assets/main.js')).toBeNull()
  })

  it('returns null for an ambiguous character', () => {
    expect(codeFromLocation('/KXT0')).toBeNull()
  })
})

describe('determineHelloMessage', () => {
  it('greets without a token when none was stored', () => {
    expect(determineHelloMessage('KXTP', null)).toEqual({
      type: 'hello',
      protocolVersion: PROTOCOL_VERSION,
      code: 'KXTP',
    })
  })

  it('rejoins with the stored token when one was stored', () => {
    expect(determineHelloMessage('KXTP', 'stored-token')).toEqual({
      type: 'hello',
      protocolVersion: PROTOCOL_VERSION,
      code: 'KXTP',
      token: 'stored-token',
    })
  })
})

describe('determineTokenToStore', () => {
  it('reads the token off a welcome message', () => {
    expect(determineTokenToStore({ type: 'welcome', participantId: 'p1', token: 'abc' })).toBe('abc')
  })

  it('leaves a table state message with nothing to store', () => {
    expect(
      determineTokenToStore({
        type: 'tableState',
        table: { code: 'KXTP', phase: 'awaiting-host', participants: [] },
      }),
    ).toBeNull()
  })

  it('leaves an error message with nothing to store', () => {
    expect(determineTokenToStore({ type: 'error', code: 'unknown-table' })).toBeNull()
  })

  it('leaves a reload message with nothing to store', () => {
    expect(determineTokenToStore({ type: 'reload', reason: 'protocol-version' })).toBeNull()
  })

  it('leaves a tableReady message with nothing to store', () => {
    expect(determineTokenToStore({ type: 'tableReady', code: 'KXTP' })).toBeNull()
  })
})
