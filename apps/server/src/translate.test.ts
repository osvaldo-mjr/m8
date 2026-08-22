import type { GameManifest } from '@m8/contract'
import type { DeviceView, DomainError, ParticipantView, TableView } from '@m8/core'
import type { ErrorCode } from '@m8/protocol'
import { describe, expect, it } from 'vitest'
import { clampPage, translateDevice, translateError, translateParticipant, translateTable } from './translate.js'

function manifest(overrides: Partial<GameManifest> = {}): GameManifest {
  return {
    id: 'tic-tac-toe',
    contractVersion: 1,
    seats: { min: 2, max: 2 },
    name: { 'pt-BR': 'Jogo da velha', en: 'Tic-tac-toe' },
    tagline: { 'pt-BR': 'Três em linha', en: 'Three in a row' },
    manual: {
      'pt-BR': [
        { title: 'Página um', lines: ['Primeira linha'] },
        { title: 'Página dois', lines: ['Segunda linha'] },
      ],
      en: [
        { title: 'Page one', lines: ['First line'] },
        { title: 'Page two', lines: ['Second line'] },
      ],
    },
    cover: 'cover.svg',
    status: 'playable',
    ...overrides,
  }
}

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

    expect(translateTable(view, [])).toEqual({
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
    expect(translateTable(view, [])).toEqual({
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

    expect(translateTable(view, []).seats).toEqual([
      { number: 0, occupant: { id: 'p-1', nickname: 'Ana', avatarId: 'fox', connected: true, hasBaton: true } },
      { number: 1, occupant: null },
    ])
  })

  it('resolves a preview to its cover, name and current page', () => {
    const view: TableView = {
      code: 'ABCD',
      phase: 'choosing-game',
      participants: [],
      seats: [],
      chosenGameId: null,
      preview: { gameId: 'tic-tac-toe', page: 1 },
      qrVisible: true,
    }

    expect(translateTable(view, [manifest()]).preview).toEqual({
      gameId: 'tic-tac-toe',
      cover: '/covers/tic-tac-toe/cover.svg',
      name: { 'pt-BR': 'Jogo da velha', en: 'Tic-tac-toe' },
      page: 1,
      pageCount: 2,
      title: { 'pt-BR': 'Página dois', en: 'Page two' },
      lines: { 'pt-BR': ['Segunda linha'], en: ['Second line'] },
    })
  })

  it('resolves to no preview when the previewed game has left the catalogue', () => {
    const view: TableView = {
      code: 'ABCD',
      phase: 'choosing-game',
      participants: [],
      seats: [],
      chosenGameId: null,
      preview: { gameId: 'withdrawn', page: 0 },
      qrVisible: true,
    }

    expect(translateTable(view, [manifest()]).preview).toBeNull()
  })

  it('clamps a stored page beyond the manifest it now resolves against', () => {
    const view: TableView = {
      code: 'ABCD',
      phase: 'choosing-game',
      participants: [],
      seats: [],
      chosenGameId: null,
      preview: { gameId: 'tic-tac-toe', page: 99 },
      qrVisible: true,
    }

    expect(translateTable(view, [manifest()]).preview?.page).toBe(1)
  })

  it('resolves to no preview rather than indexing into an empty manual', () => {
    // manifestFaults rejects a manifest with an empty manual, so this
    // should never reach the catalogue for real — but translatePreview
    // must not depend on that guarantee holding three packages away.
    const empty = manifest({ manual: { 'pt-BR': [], en: [] } })
    const view: TableView = {
      code: 'ABCD',
      phase: 'choosing-game',
      participants: [],
      seats: [],
      chosenGameId: null,
      preview: { gameId: empty.id, page: 0 },
      qrVisible: true,
    }

    expect(translateTable(view, [empty]).preview).toBeNull()
  })
})

describe('translateDevice', () => {
  it('carries every field across, field by field', () => {
    const view: DeviceView = {
      participantId: 'p-1',
      phase: 'seating',
      seatNumber: 1,
      hasBaton: true,
      canChooseGame: false,
      canStart: false,
      playersNeeded: 1,
    }

    expect(translateDevice(view)).toEqual({
      participantId: 'p-1',
      phase: 'seating',
      seatNumber: 1,
      hasBaton: true,
      canChooseGame: false,
      canStart: false,
      playersNeeded: 1,
    })
  })
})

describe('clampPage', () => {
  it('passes a page already inside range through unchanged', () => {
    expect(clampPage(1, 3)).toBe(1)
  })

  it('clamps a page beyond the last to the last', () => {
    expect(clampPage(99, 3)).toBe(2)
  })

  it('clamps a negative page to the first', () => {
    expect(clampPage(-5, 3)).toBe(0)
  })

  it('rounds a fractional page down to a valid index rather than returning one', () => {
    // The wire is expected to reject a fractional page before this is ever
    // called (see validate.ts), but clampPage must not depend on that
    // guarantee holding three packages away: it is the last line of defence
    // before an array index.
    expect(clampPage(1.5, 3)).toBe(1)
  })

  it('is total: a manifest with no pages at all still yields a valid index', () => {
    expect(clampPage(2, 0)).toBe(0)
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
