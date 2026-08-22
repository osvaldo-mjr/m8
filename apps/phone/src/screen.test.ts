import type { DeviceSnapshot, ErrorCode, TablePhaseName } from '@m8/protocol'
import { describe, expect, it } from 'vitest'
import { determineScreen, errorText, startReasonText, waitingText } from './screen.js'

function device(overrides: Partial<DeviceSnapshot> = {}): DeviceSnapshot {
  return {
    participantId: 'p1',
    phase: 'seating',
    seatNumber: null,
    hasBaton: false,
    canChooseGame: false,
    canStart: false,
    playersNeeded: 0,
    ...overrides,
  }
}

describe('determineScreen', () => {
  it('shows connecting when nothing has arrived yet', () => {
    expect(determineScreen(null, false, null, null)).toEqual({ kind: 'connecting' })
  })

  it('prefers connecting even once a profile has been recorded, until a device snapshot arrives', () => {
    expect(determineScreen(null, true, null, null)).toEqual({ kind: 'connecting' })
  })

  it('shows the profile form once a device snapshot arrives with no stored profile', () => {
    expect(determineScreen(device({ phase: 'awaiting-host', hasBaton: true }), false, null, null)).toEqual({
      kind: 'profile',
    })
  })

  it('shows the error screen whenever an error arrived, even with a profile and a device known', () => {
    expect(determineScreen(device(), true, null, 'not-allowed')).toEqual({
      kind: 'error',
      code: 'not-allowed',
    })
  })

  describe('while the host is choosing a game (phases awaiting-host and choosing-game)', () => {
    it('shows the catalogue when nothing is being previewed', () => {
      const snapshot = device({ phase: 'awaiting-host', hasBaton: true, canChooseGame: true })
      expect(determineScreen(snapshot, true, null, null)).toEqual({ kind: 'choosing', device: snapshot })
    })

    it('shows the preview once a game has been tapped', () => {
      const snapshot = device({ phase: 'choosing-game', hasBaton: true, canChooseGame: true })
      expect(determineScreen(snapshot, true, 'tic-tac-toe', null)).toEqual({
        kind: 'preview',
        device: snapshot,
        gameId: 'tic-tac-toe',
      })
    })
  })

  describe('during seating', () => {
    it('shows the seating screen for a participant who holds a seat', () => {
      const snapshot = device({ phase: 'seating', seatNumber: 3 })
      expect(determineScreen(snapshot, true, null, null)).toEqual({ kind: 'seating', device: snapshot })
    })

    it('shows the seating screen for the host even without a seat of his own', () => {
      const snapshot = device({ phase: 'seating', hasBaton: true, seatNumber: null })
      expect(determineScreen(snapshot, true, null, null)).toEqual({ kind: 'seating', device: snapshot })
    })

    it('shows waiting for a participant with neither a seat nor the baton', () => {
      const snapshot = device({ phase: 'seating', hasBaton: false, seatNumber: null })
      expect(determineScreen(snapshot, true, null, null)).toEqual({ kind: 'waiting', device: snapshot })
    })

    // The case a boolean form gets wrong: a device that held a seat and no
    // longer does (the host stepping out of his own chair) must fall back to
    // waiting-or-hosting exactly as if it had never been seated at all — not
    // keep showing the seating screen's seat block from a moment ago. Two
    // independent calls, not a diff between them: `determineScreen` carries
    // no memory of what it returned last time.
    it('drops back out of the seated view for a device that was seated and is no longer', () => {
      const seated = device({ phase: 'seating', hasBaton: false, seatNumber: 2 })
      const unseated = device({ phase: 'seating', hasBaton: false, seatNumber: null })

      expect(determineScreen(seated, true, null, null)).toEqual({ kind: 'seating', device: seated })
      expect(determineScreen(unseated, true, null, null)).toEqual({ kind: 'waiting', device: unseated })
    })

    it('keeps the host on the seating screen even after he steps out of his own seat', () => {
      const hosting = device({ phase: 'seating', hasBaton: true, seatNumber: 1 })
      const steppedOut = device({ phase: 'seating', hasBaton: true, seatNumber: null })

      expect(determineScreen(hosting, true, null, null)).toEqual({ kind: 'seating', device: hosting })
      expect(determineScreen(steppedOut, true, null, null)).toEqual({ kind: 'seating', device: steppedOut })
    })
  })

  describe('once a match has started or ended, in phases this plan draws no screen for', () => {
    const phases: DeviceSnapshot['phase'][] = ['playing', 'paused', 'awaiting-seat', 'finished']

    for (const phase of phases) {
      it(`shows waiting during ${phase}, even for a seated participant`, () => {
        const snapshot = device({ phase, seatNumber: 1 })
        expect(determineScreen(snapshot, true, null, null)).toEqual({ kind: 'waiting', device: snapshot })
      })
    }
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

describe('startReasonText', () => {
  it('gives no reason once nobody more is needed', () => {
    expect(startReasonText(0)).toBeNull()
  })

  it('gives no reason for a count that should never occur, rather than a negative sentence', () => {
    expect(startReasonText(-1)).toBeNull()
  })

  it('uses the singular for exactly one more player', () => {
    expect(startReasonText(1)).toBe('Waiting for one more player.')
  })

  it('uses the plural, and the real count, for more than one', () => {
    expect(startReasonText(3)).toBe('Waiting for 3 more players.')
  })
})

describe('waitingText', () => {
  const phases: TablePhaseName[] = [
    'awaiting-host',
    'choosing-game',
    'seating',
    'playing',
    'paused',
    'awaiting-seat',
    'finished',
  ]

  it('has something to say for every phase the wire can name', () => {
    for (const phase of phases) {
      expect(waitingText(phase)).not.toBe('')
    }
  })

  it('says something different once the match is actually on than while still seating', () => {
    expect(waitingText('playing')).not.toBe(waitingText('seating'))
  })
})
