import { describe, expect, it } from 'vitest'
import { PROTOCOL_VERSION } from './messages.js'
import { parseInbound } from './validate.js'

describe('parseInbound', () => {
  it('accepts a well-formed hello', () => {
    const message = { type: 'hello', protocolVersion: PROTOCOL_VERSION, code: 'KXTP' }
    expect(parseInbound(message)).toEqual(message)
  })

  it('accepts hello with a token', () => {
    const message = {
      type: 'hello',
      protocolVersion: PROTOCOL_VERSION,
      code: 'KXTP',
      token: 'abc',
    }
    expect(parseInbound(message)).toEqual(message)
  })

  it('accepts helloTable without a code', () => {
    const message = { type: 'helloTable', protocolVersion: PROTOCOL_VERSION }
    expect(parseInbound(message)).toEqual(message)
  })

  it('accepts a well-formed setProfile', () => {
    const message = { type: 'setProfile', nickname: 'Ana', avatarId: 'fox' }
    expect(parseInbound(message)).toEqual(message)
  })

  it('accepts leave', () => {
    expect(parseInbound({ type: 'leave' })).toEqual({ type: 'leave' })
  })

  it('rejects a message with no type', () => {
    expect(parseInbound({ code: 'KXTP' })).toBeNull()
  })

  it('rejects an unknown type', () => {
    expect(parseInbound({ type: 'launchMissiles' })).toBeNull()
  })

  it('rejects hello with a non-string code', () => {
    expect(parseInbound({ type: 'hello', protocolVersion: PROTOCOL_VERSION, code: 42 })).toBeNull()
  })

  it('rejects setProfile with a missing field', () => {
    expect(parseInbound({ type: 'setProfile', nickname: 'Ana' })).toBeNull()
  })

  it('rejects non-objects', () => {
    expect(parseInbound(null)).toBeNull()
    expect(parseInbound('hello')).toBeNull()
    expect(parseInbound(7)).toBeNull()
  })

  // --- Controller-issued additions: contracts the brief leaves unpinned ---

  it('strips unknown fields rather than passing them through', () => {
    const leaveResult = parseInbound({ type: 'leave', evil: 1 })
    expect(leaveResult).toEqual({ type: 'leave' })
    expect(leaveResult).not.toHaveProperty('evil')

    const helloResult = parseInbound({
      type: 'hello',
      protocolVersion: PROTOCOL_VERSION,
      code: 'KXTP',
      evil: 1,
    })
    expect(helloResult).toEqual({ type: 'hello', protocolVersion: PROTOCOL_VERSION, code: 'KXTP' })
    expect(helloResult).not.toHaveProperty('evil')
  })

  // Deliberate: version checking belongs to the session layer, which answers
  // a mismatch by telling the client to reload (a 'reload' message), not by
  // rejecting the message here as generically invalid. Do not "fix" this by
  // making parseInbound compare against PROTOCOL_VERSION.
  it('accepts a mismatched protocolVersion (version checking is not this layer\'s job)', () => {
    const helloMessage = {
      type: 'hello',
      protocolVersion: PROTOCOL_VERSION + 1,
      code: 'KXTP',
    }
    expect(parseInbound(helloMessage)).toEqual(helloMessage)

    const helloTableMessage = { type: 'helloTable', protocolVersion: PROTOCOL_VERSION + 1 }
    expect(parseInbound(helloTableMessage)).toEqual(helloTableMessage)
  })

  it('rejects protocolVersion that is not a number', () => {
    expect(parseInbound({ type: 'hello', protocolVersion: '1', code: 'KXTP' })).toBeNull()
    expect(parseInbound({ type: 'hello', protocolVersion: null, code: 'KXTP' })).toBeNull()
    expect(parseInbound({ type: 'helloTable', protocolVersion: '1' })).toBeNull()
    expect(parseInbound({ type: 'helloTable', protocolVersion: null })).toBeNull()
  })

  it('rejects arrays', () => {
    expect(parseInbound([])).toBeNull()
    expect(parseInbound([{ type: 'leave' }])).toBeNull()
  })

  // --- hello's round marker ---

  it('accepts hello with a round marker', () => {
    const message = { type: 'hello', protocolVersion: PROTOCOL_VERSION, code: 'KXTP', round: 3 }
    expect(parseInbound(message)).toEqual(message)
  })

  it('accepts hello without a round marker, which is a typed arrival', () => {
    const message = { type: 'hello', protocolVersion: PROTOCOL_VERSION, code: 'KXTP' }
    expect(parseInbound(message)).toEqual(message)
  })

  it('rejects a round that is not a number', () => {
    expect(
      parseInbound({ type: 'hello', protocolVersion: PROTOCOL_VERSION, code: 'KXTP', round: '3' }),
    ).toBeNull()
  })

  // --- previewGame ---

  it('accepts a well-formed previewGame', () => {
    const message = { type: 'previewGame', gameId: 'chess' }
    expect(parseInbound(message)).toEqual(message)
  })

  it('rejects previewGame with a non-string gameId', () => {
    expect(parseInbound({ type: 'previewGame', gameId: 42 })).toBeNull()
  })

  it('strips an unknown field from previewGame', () => {
    expect(parseInbound({ type: 'previewGame', gameId: 'chess', evil: 1 })).toEqual({
      type: 'previewGame',
      gameId: 'chess',
    })
  })

  // --- manualPage ---

  it('accepts a well-formed manualPage', () => {
    const message = { type: 'manualPage', page: 2 }
    expect(parseInbound(message)).toEqual(message)
  })

  it('rejects manualPage with a non-number page', () => {
    expect(parseInbound({ type: 'manualPage', page: '2' })).toBeNull()
  })

  it('accepts manualPage with a negative page, leaving the clamp to the server', () => {
    // A stepper held past the first page is exactly the arrow-mashing this
    // message exists for; the server clamps it rather than the wire
    // rejecting it, so a page arrow stops at the edge instead of raising an
    // error on the television. See apps/server/src/translate.ts:clampPage.
    const message = { type: 'manualPage', page: -1 }
    expect(parseInbound(message)).toEqual(message)
  })

  it('strips an unknown field from manualPage', () => {
    expect(parseInbound({ type: 'manualPage', page: 2, evil: 1 })).toEqual({
      type: 'manualPage',
      page: 2,
    })
  })

  // --- chooseGame ---

  it('accepts a well-formed chooseGame', () => {
    const message = { type: 'chooseGame', gameId: 'chess' }
    expect(parseInbound(message)).toEqual(message)
  })

  it('rejects chooseGame with a non-string gameId', () => {
    expect(parseInbound({ type: 'chooseGame', gameId: 42 })).toBeNull()
  })

  it('strips an unknown field from every new message', () => {
    expect(parseInbound({ type: 'chooseGame', gameId: 'chess', evil: 1 })).toEqual({
      type: 'chooseGame',
      gameId: 'chess',
    })
  })

  // --- setHostPlaying ---

  it('accepts a well-formed setHostPlaying', () => {
    const message = { type: 'setHostPlaying', playing: true }
    expect(parseInbound(message)).toEqual(message)
  })

  it('rejects setHostPlaying with a non-boolean playing', () => {
    expect(parseInbound({ type: 'setHostPlaying', playing: 'yes' })).toBeNull()
  })

  it('strips an unknown field from setHostPlaying', () => {
    expect(parseInbound({ type: 'setHostPlaying', playing: true, evil: 1 })).toEqual({
      type: 'setHostPlaying',
      playing: true,
    })
  })
})
