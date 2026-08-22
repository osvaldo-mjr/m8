import type { DomainError, ParticipantView, TableView } from '@m8/core'
import type { ErrorCode } from '@m8/protocol'
import { describe, expect, it } from 'vitest'
import { translateError, translateParticipant, translateTable } from './translate.js'

describe('translateParticipant', () => {
  it('carries every field across, field by field', () => {
    const view: ParticipantView = {
      id: 'p-1',
      nickname: 'Ana',
      avatarId: 'fox',
      connected: true,
      hasBaton: true,
    }

    expect(translateParticipant(view)).toEqual({
      id: 'p-1',
      nickname: 'Ana',
      avatarId: 'fox',
      connected: true,
      hasBaton: true,
    })
  })
})

describe('translateTable', () => {
  it('carries the table fields and translates every participant', () => {
    const view: TableView = {
      code: 'ABCD',
      phase: 'choosing-game',
      participants: [
        { id: 'p-1', nickname: 'Ana', avatarId: 'fox', connected: true, hasBaton: true },
        { id: 'p-2', nickname: '', avatarId: 'unset', connected: false, hasBaton: false },
      ],
      seats: [],
      chosenGameId: null,
      preview: null,
      qrVisible: false,
    }

    expect(translateTable(view)).toEqual({
      code: 'ABCD',
      phase: 'choosing-game',
      participants: [
        { id: 'p-1', nickname: 'Ana', avatarId: 'fox', connected: true, hasBaton: true },
        { id: 'p-2', nickname: '', avatarId: 'unset', connected: false, hasBaton: false },
      ],
      seats: [],
      qrVisible: false,
      preview: null,
    })
  })

  it('produces an empty participant list from an empty table', () => {
    const view: TableView = {
      code: 'ABCD',
      phase: 'awaiting-host',
      participants: [],
      seats: [],
      chosenGameId: null,
      preview: null,
      qrVisible: true,
    }
    expect(translateTable(view)).toEqual({
      code: 'ABCD',
      phase: 'awaiting-host',
      participants: [],
      seats: [],
      qrVisible: true,
      preview: null,
    })
  })

  it('translates every seat, occupied or not', () => {
    const view: TableView = {
      code: 'ABCD',
      phase: 'seating',
      participants: [{ id: 'p-1', nickname: 'Ana', avatarId: 'fox', connected: true, hasBaton: true }],
      seats: [
        { number: 0, occupant: { id: 'p-1', nickname: 'Ana', avatarId: 'fox', connected: true, hasBaton: true } },
        { number: 1, occupant: null },
      ],
      chosenGameId: 'chess',
      preview: null,
      qrVisible: false,
    }

    expect(translateTable(view).seats).toEqual([
      { number: 0, occupant: { id: 'p-1', nickname: 'Ana', avatarId: 'fox', connected: true, hasBaton: true } },
      { number: 1, occupant: null },
    ])
  })
})

describe('translateError', () => {
  // Every member of the DomainError union must appear here with an explicit
  // ErrorCode. This is a Record<DomainError, ErrorCode>, not a partial map, so
  // if core adds a new DomainError and nobody updates this table, the file
  // fails to typecheck rather than shipping `undefined` on the wire.
  const cases: Record<DomainError, ErrorCode> = {
    'unknown-table': 'unknown-table',
    'invalid-code': 'invalid-code',
    'table-full': 'table-full',
    'not-allowed': 'not-allowed',
    'table-unavailable': 'table-unavailable',
    'stale-round': 'stale-round',
  }

  for (const [domainError, errorCode] of Object.entries(cases) as [DomainError, ErrorCode][]) {
    it(`maps ${domainError} to ${errorCode}`, () => {
      expect(translateError(domainError)).toBe(errorCode)
    })
  }
})
