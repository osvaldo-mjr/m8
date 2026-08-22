import type { ErrorCode, TableSnapshot } from '@m8/protocol'
import { describe, expect, it } from 'vitest'
import { determineScreen, errorText } from './screen.js'

const tableWithoutNickname: TableSnapshot = {
  code: 'KXTP',
  phase: 'awaiting-host',
  participants: [
    { id: 'p1', nickname: '', avatarId: 'fox', connected: true, hasBaton: true },
  ],
  seats: [],
  qrVisible: true,
  preview: null,
}

const tableWithNickname: TableSnapshot = {
  code: 'KXTP',
  phase: 'awaiting-host',
  participants: [
    { id: 'p1', nickname: 'Ada', avatarId: 'fox', connected: true, hasBaton: true },
  ],
  seats: [],
  qrVisible: true,
  preview: null,
}

const tableWithoutParticipant: TableSnapshot = {
  code: 'KXTP',
  phase: 'awaiting-host',
  participants: [
    { id: 'p2', nickname: 'Grace', avatarId: 'owl', connected: true, hasBaton: true },
  ],
  seats: [],
  qrVisible: true,
  preview: null,
}

describe('determineScreen', () => {
  it('shows connecting when nothing has been received yet', () => {
    expect(determineScreen(null, null, null)).toEqual({ kind: 'connecting' })
  })

  it('shows connecting when welcomed but no snapshot has arrived yet', () => {
    expect(determineScreen(null, 'p1', null)).toEqual({ kind: 'connecting' })
  })

  it('shows the profile form when present in the snapshot without a nickname', () => {
    expect(determineScreen(tableWithoutNickname, 'p1', null)).toEqual({ kind: 'profile' })
  })

  it('shows the table when present in the snapshot with a nickname', () => {
    expect(determineScreen(tableWithNickname, 'p1', null)).toEqual({
      kind: 'table',
      table: tableWithNickname,
    })
  })

  it('shows the error screen when an error arrived', () => {
    expect(determineScreen(null, null, 'unknown-table')).toEqual({
      kind: 'error',
      code: 'unknown-table',
    })
  })

  it('prefers the error screen even once a table and a seat are known', () => {
    expect(determineScreen(tableWithNickname, 'p1', 'not-allowed')).toEqual({
      kind: 'error',
      code: 'not-allowed',
    })
  })

  it('shows no-seat when previously present and now absent from the snapshot', () => {
    expect(determineScreen(tableWithoutParticipant, 'p1', null)).toEqual({ kind: 'no-seat' })
  })
})

describe('errorText', () => {
  const codes: ErrorCode[] = [
    'unknown-table',
    'invalid-code',
    'table-full',
    'not-allowed',
    'invalid-message',
  ]

  it('tells the person where to look, for every error the wire can carry', () => {
    for (const code of codes) {
      expect(errorText(code)).toMatch(/scan the code on the screen/i)
    }
  })

  it('never puts the wire code itself in front of a person', () => {
    for (const code of codes) {
      expect(errorText(code)).not.toContain(code)
    }
  })

  it('says something different for a full table than for a closed one', () => {
    expect(errorText('table-full')).not.toBe(errorText('unknown-table'))
  })
})
