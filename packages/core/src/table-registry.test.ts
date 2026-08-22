import { AVATARS } from '@m8/avatars'
import { beforeEach, describe, expect, it } from 'vitest'
import { FixedClock } from './clock.js'
import { sequentialIds } from './ids.js'
import { createRng } from './rng.js'
import { MAX_PARTICIPANTS, TableRegistry } from './table-registry.js'
import type { Participant, Table } from './table.js'
import type { DomainError } from './views.js'

/**
 * A fresh table, with the result unwrapped. `openTable` is the only way to
 * obtain one — it can refuse, and refusing rather than throwing is the whole
 * point — so the tests that merely need a table say so through this.
 */
function newTable(registry: TableRegistry): Table {
  const result = registry.openTable()
  if ('error' in result) throw new Error(`Expected a table, got ${result.error}`)
  return result.table
}

function makeRegistry(): TableRegistry {
  return new TableRegistry({
    clock: new FixedClock(1_000),
    rng: createRng(2026),
    newParticipantId: sequentialIds('p'),
    newToken: sequentialIds('t'),
    shard: 'A',
  })
}

/**
 * A participant claiming a place at the table, with the refusable result
 * unwrapped. Every test that merely needs someone seated says so through
 * this, the same way `newTable` stands in for `openTable`.
 */
function join(registry: TableRegistry, code: string): Participant {
  const result = registry.joinParticipant(code, undefined, undefined)
  if ('error' in result) throw new Error(`Expected a join, got ${result.error}`)
  return result.participant
}

describe('TableRegistry.openTable, opening a fresh table', () => {
  let registry: TableRegistry

  beforeEach(() => {
    registry = makeRegistry()
  })

  it('creates a table awaiting a host', () => {
    const table = newTable(registry)
    expect(table.phase).toBe('awaiting-host')
    expect(table.participants).toEqual([])
    expect(table.batonHolderId).toBeNull()
  })

  it('creates tables with distinct codes', () => {
    const first = newTable(registry)
    const second = newTable(registry)
    expect(first.code).not.toBe(second.code)
  })

  it('finds a table by its code', () => {
    const table = newTable(registry)
    expect(registry.getTable(table.code)).toBe(table)
  })

  it('finds a table by a lowercase code', () => {
    const table = newTable(registry)
    expect(registry.getTable(table.code.toLowerCase())).toBe(table)
  })

  it('returns undefined for an unknown code', () => {
    expect(registry.getTable('ZZZZ')).toBeUndefined()
  })
})

describe('TableRegistry.openTable', () => {
  let registry: TableRegistry

  beforeEach(() => {
    registry = makeRegistry()
  })

  it('creates a fresh table when no code is given', () => {
    const table = newTable(registry)
    expect(table.phase).toBe('awaiting-host')
    expect(registry.getTable(table.code)).toBe(table)
  })

  it('reopens the same table for a known code', () => {
    const original = newTable(registry)
    expect(registry.openTable(original.code)).toEqual({ table: original })
  })

  it('creates a fresh table when the given code is unknown', () => {
    const result = registry.openTable('ZZZZ')
    if ('error' in result) throw new Error(result.error)
    expect(result.table.code).not.toBe('ZZZZ')
    expect(registry.getTable(result.table.code)).toBe(result.table)
  })
})

describe('TableRegistry.joinParticipant', () => {
  let registry: TableRegistry
  let code: string

  beforeEach(() => {
    registry = makeRegistry()
    code = newTable(registry).code
  })

  it('rejects an unknown table', () => {
    const result = registry.joinParticipant('ZZZZ', undefined)
    expect(result).toEqual({ error: 'unknown-table' })
  })

  it('rejects a malformed code', () => {
    const result = registry.joinParticipant('nope!', undefined)
    expect(result).toEqual({ error: 'invalid-code' })
  })

  it('gives the baton to the first participant', () => {
    const result = registry.joinParticipant(code, undefined)
    if ('error' in result) throw new Error(result.error)

    expect(result.table.batonHolderId).toBe(result.participant.id)
  })

  it('moves the table to choosing-game once a host arrives', () => {
    const result = registry.joinParticipant(code, undefined)
    if ('error' in result) throw new Error(result.error)
    expect(result.table.phase).toBe('choosing-game')
  })

  it('does not give the baton to the second participant', () => {
    const first = registry.joinParticipant(code, undefined)
    if ('error' in first) throw new Error('join failed')
    registry.chooseGame(code, first.participant.id, 'tic-tac-toe', { min: 1, max: 2 })
    const second = registry.joinParticipant(code, undefined)
    if ('error' in second) throw new Error('join failed')

    expect(second.table.batonHolderId).toBe(first.participant.id)
  })

  it('issues a token the device can present later', () => {
    const result = registry.joinParticipant(code, undefined)
    if ('error' in result) throw new Error(result.error)
    expect(result.participant.token).toBe('t-1')
  })

  it('recognizes a returning token as the same participant', () => {
    const first = registry.joinParticipant(code, undefined)
    if ('error' in first) throw new Error(first.error)
    registry.disconnectParticipant(code, first.participant.id)

    const again = registry.joinParticipant(code, first.participant.token)
    if ('error' in again) throw new Error(again.error)

    expect(again.participant.id).toBe(first.participant.id)
    expect(again.table.participants).toHaveLength(1)
  })

  it('treats an unrecognized token as a new participant', () => {
    const result = registry.joinParticipant(code, 'not-a-real-token')
    if ('error' in result) throw new Error(result.error)
    expect(result.participant.token).toBe('t-1')
  })
})

describe('TableRegistry.disconnectParticipant', () => {
  it('marks the participant disconnected without removing them', () => {
    const registry = makeRegistry()
    const code = newTable(registry).code
    const joined = registry.joinParticipant(code, undefined)
    if ('error' in joined) throw new Error(joined.error)

    registry.disconnectParticipant(code, joined.participant.id)

    expect(registry.getTable(code)?.participants).toHaveLength(1)
    expect(registry.getTable(code)?.participants[0]?.connected).toBe(false)
  })

  it('never changes the baton holder when the holder disconnects', () => {
    const registry = makeRegistry()
    const code = newTable(registry).code
    const host = registry.joinParticipant(code, undefined)
    if ('error' in host) throw new Error(host.error)

    registry.disconnectParticipant(code, host.participant.id)

    expect(registry.getTable(code)?.batonHolderId).toBe(host.participant.id)
  })

  it('never changes the baton holder when a non-holder disconnects', () => {
    const registry = makeRegistry()
    const code = newTable(registry).code
    const host = registry.joinParticipant(code, undefined)
    if ('error' in host) throw new Error('join failed')
    registry.chooseGame(code, host.participant.id, 'tic-tac-toe', { min: 1, max: 2 })
    const second = registry.joinParticipant(code, undefined)
    if ('error' in second) throw new Error('join failed')

    registry.disconnectParticipant(code, second.participant.id)

    expect(registry.getTable(code)?.batonHolderId).toBe(host.participant.id)
  })
})

describe('TableRegistry.removeParticipant', () => {
  it('migrates the baton to the longest-present survivor', () => {
    const registry = makeRegistry()
    const code = newTable(registry).code
    const host = registry.joinParticipant(code, undefined)
    if ('error' in host) throw new Error('join failed')
    registry.chooseGame(code, host.participant.id, 'tic-tac-toe', { min: 1, max: 2 })
    const second = registry.joinParticipant(code, undefined)
    if ('error' in second) throw new Error('join failed')

    registry.removeParticipant(code, host.participant.id)

    expect(registry.getTable(code)?.batonHolderId).toBe(second.participant.id)
  })

  it('returns the table to awaiting-host when the last participant leaves', () => {
    const registry = makeRegistry()
    const code = newTable(registry).code
    const host = registry.joinParticipant(code, undefined)
    if ('error' in host) throw new Error(host.error)

    registry.removeParticipant(code, host.participant.id)

    const table = registry.getTable(code)
    expect(table?.phase).toBe('awaiting-host')
    expect(table?.batonHolderId).toBeNull()
  })

  /**
   * The existing transition test above covers a table nobody had chosen a game
   * at yet, which is why this was missed: everything a chosen game writes —
   * the game itself, the seats, the minimum, the preview — was left behind on
   * a table with nobody at it. The next arrival became host of a table that
   * already had a game, and `canChooseGame` is `hasBaton && chosenGameId ===
   * null`, so it was permanently false: the catalogue listed every game with
   * PLAY THIS disabled and no way forward. Worse, a table with a game chosen
   * and free seats shows the joining QR, so a screen sitting in
   * `choosing-game` would have invited strangers in to take seats for a game
   * nobody had chosen.
   *
   * So emptying a table means emptying it: what comes back is a table as fresh
   * as the one the screen opened.
   */
  describe('when the last participant leaves a table that had chosen a game', () => {
    function emptiedTable(): { registry: TableRegistry; code: string } {
      const registry = makeRegistry()
      const code = newTable(registry).code
      const host = join(registry, code)
      registry.chooseGame(code, host.id, 'tic-tac-toe', { min: 2, max: 2 })
      registry.removeParticipant(code, host.id)
      return { registry, code }
    }

    it('forgets the game, so the next host can choose one', () => {
      const { registry, code } = emptiedTable()

      expect(registry.getTable(code)?.chosenGameId).toBeNull()

      const next = join(registry, code)
      expect(registry.deviceView(registry.getTable(code)!, next.id).canChooseGame).toBe(true)
      expect(registry.chooseGame(code, next.id, 'tic-tac-toe', { min: 2, max: 2 })).toBeUndefined()
    })

    it('forgets the seats the game sized, and the minimum it set', () => {
      const { registry, code } = emptiedTable()

      const table = registry.getTable(code)!
      expect(table.seats).toEqual([])
      expect(table.seatsMin).toBeNull()
    })

    it('forgets anything left on preview', () => {
      const registry = makeRegistry()
      const code = newTable(registry).code
      const host = join(registry, code)
      registry.previewGame(code, host.id, 'chess')

      registry.removeParticipant(code, host.id)

      expect(registry.getTable(code)?.preview).toBeNull()
    })

    it('stops showing the joining QR again the moment a new host is choosing', () => {
      const { registry, code } = emptiedTable()

      // Empty, so the QR is shown: the first arrival is exactly who it is for.
      expect(registry.snapshot(registry.getTable(code)!).qrVisible).toBe(true)

      join(registry, code)

      // And gone again while that host chooses, which is the design's rule:
      // between the first arrival and a chosen game, nobody else may join.
      expect(registry.snapshot(registry.getTable(code)!).qrVisible).toBe(false)
    })

    /**
     * Deliberately unchanged, and it is a real question.
     *
     * The round exists to refuse a phone resuming a session the table has
     * moved past. Nothing can be holding such a session here: the only way to
     * empty a table is for every participant to leave, and a phone that left
     * is a phone that gave up its place deliberately. A disconnection does not
     * remove anyone, so the pocket-phone case this guard is for cannot reach
     * this path. Advancing the round here would refuse nobody and cost the one
     * device that might legitimately come straight back.
     *
     * The two actions that are meant to advance it — "Clear seats" and "Change
     * game" — end a match that other people are still sitting at, which is
     * precisely when a stale session is possible. Both belong to Plan 3, and
     * so does the bump.
     */
    it('does not advance the round, which nothing here could be stale against', () => {
      const { registry, code } = emptiedTable()

      expect(registry.getTable(code)?.round).toBe(1)
    })
  })

  it('leaves the baton untouched when a non-holder leaves', () => {
    const registry = makeRegistry()
    const code = newTable(registry).code
    const host = registry.joinParticipant(code, undefined)
    if ('error' in host) throw new Error('join failed')
    registry.chooseGame(code, host.participant.id, 'tic-tac-toe', { min: 1, max: 2 })
    const second = registry.joinParticipant(code, undefined)
    if ('error' in second) throw new Error('join failed')

    registry.removeParticipant(code, second.participant.id)

    expect(registry.getTable(code)?.batonHolderId).toBe(host.participant.id)
  })
})

describe('TableRegistry.setProfile', () => {
  it('stores the nickname and avatar', () => {
    const registry = makeRegistry()
    const code = newTable(registry).code
    const joined = registry.joinParticipant(code, undefined)
    if ('error' in joined) throw new Error(joined.error)

    registry.setProfile(code, joined.participant.id, 'Ana', 'fox')

    const table = registry.getTable(code)
    expect(table?.participants[0]?.nickname).toBe('Ana')
    expect(table?.participants[0]?.avatarId).toBe('fox')
  })

  it('trims and truncates an over-long nickname', () => {
    const registry = makeRegistry()
    const code = newTable(registry).code
    const joined = registry.joinParticipant(code, undefined)
    if ('error' in joined) throw new Error(joined.error)

    registry.setProfile(code, joined.participant.id, `   ${'x'.repeat(50)}   `, 'fox')

    expect(registry.getTable(code)?.participants[0]?.nickname).toHaveLength(16)
  })

  it('treats a blank nickname as no profile change', () => {
    const registry = makeRegistry()
    const code = newTable(registry).code
    const joined = registry.joinParticipant(code, undefined)
    if ('error' in joined) throw new Error(joined.error)

    registry.setProfile(code, joined.participant.id, '', 'fox')

    expect(registry.getTable(code)?.participants[0]?.nickname).toBe('')
    expect(registry.getTable(code)?.participants[0]?.avatarId).not.toBe('fox')
  })

  it('treats a whitespace-only nickname as no profile change', () => {
    const registry = makeRegistry()
    const code = newTable(registry).code
    const joined = registry.joinParticipant(code, undefined)
    if ('error' in joined) throw new Error(joined.error)

    registry.setProfile(code, joined.participant.id, '   ', 'fox')

    expect(registry.getTable(code)?.participants[0]?.nickname).toBe('')
    expect(registry.getTable(code)?.participants[0]?.avatarId).not.toBe('fox')
  })

  it('still stores a valid nickname', () => {
    const registry = makeRegistry()
    const code = newTable(registry).code
    const joined = registry.joinParticipant(code, undefined)
    if ('error' in joined) throw new Error(joined.error)

    registry.setProfile(code, joined.participant.id, 'Ana', 'fox')

    expect(registry.getTable(code)?.participants[0]?.nickname).toBe('Ana')
  })
})

describe('TableRegistry.setProfile avatar validation', () => {
  it('rejects an avatarId that names no avatar, as no profile change at all', () => {
    const registry = makeRegistry()
    const code = newTable(registry).code
    const joined = registry.joinParticipant(code, undefined)
    if ('error' in joined) throw new Error(joined.error)

    registry.setProfile(code, joined.participant.id, 'Ana', 'dragon')

    // Same rule as a blank nickname: not a change to something else, no
    // change at all - so a malformed submit cannot half-apply.
    expect(registry.getTable(code)?.participants[0]?.nickname).toBe('')
    expect(registry.getTable(code)?.participants[0]?.avatarId).toBe('unset')
  })

  it('rejects an over-long avatarId rather than broadcasting it verbatim', () => {
    const registry = makeRegistry()
    const code = newTable(registry).code
    const joined = registry.joinParticipant(code, undefined)
    if ('error' in joined) throw new Error(joined.error)

    registry.setProfile(code, joined.participant.id, 'Ana', 'x'.repeat(120))

    expect(registry.getTable(code)?.participants[0]?.avatarId).toBe('unset')
  })

  it('accepts every id in the shared catalogue', () => {
    const registry = makeRegistry()
    const code = newTable(registry).code
    const joined = registry.joinParticipant(code, undefined)
    if ('error' in joined) throw new Error(joined.error)

    for (const avatar of AVATARS) {
      registry.setProfile(code, joined.participant.id, 'Ana', avatar.id)
      expect(registry.getTable(code)?.participants[0]?.avatarId).toBe(avatar.id)
    }
  })

  it('keeps the avatar already chosen when a later submit names no avatar', () => {
    const registry = makeRegistry()
    const code = newTable(registry).code
    const joined = registry.joinParticipant(code, undefined)
    if ('error' in joined) throw new Error(joined.error)
    registry.setProfile(code, joined.participant.id, 'Ana', 'fox')

    registry.setProfile(code, joined.participant.id, 'Bia', 'dragon')

    expect(registry.getTable(code)?.participants[0]?.nickname).toBe('Ana')
    expect(registry.getTable(code)?.participants[0]?.avatarId).toBe('fox')
  })
})

describe('TableRegistry.snapshot', () => {
  it('reports the baton holder', () => {
    const registry = makeRegistry()
    const table = newTable(registry)
    const joined = registry.joinParticipant(table.code, undefined)
    if ('error' in joined) throw new Error(joined.error)

    const snapshot = registry.snapshot(joined.table)

    expect(snapshot.code).toBe(table.code)
    expect(snapshot.phase).toBe('choosing-game')
    expect(snapshot.participants).toHaveLength(1)
    expect(snapshot.participants[0]?.hasBaton).toBe(true)
  })

  it('never exposes the participant token', () => {
    const registry = makeRegistry()
    const table = newTable(registry)
    registry.joinParticipant(table.code, undefined)

    const snapshot = registry.snapshot(table)

    // Structural, not value-based: proves no private field exists on the
    // view at all, rather than merely that one particular token value is
    // absent from the serialized text.
    expect(Object.keys(snapshot.participants[0]!).sort()).toEqual([
      'avatarId',
      'connected',
      'hasBaton',
      'id',
      'nickname',
    ])
  })

  it('preserves arrival order, not id order', () => {
    // The ids are deliberately out of order with arrival. A monotonic id
    // source cannot tell arrival order from sort-by-id at all: it never
    // reuses, so for any surviving subset the two orders coincide and the
    // test would pass against an implementation that tracked nothing.
    // Sorting these by id gives p-2, p-5, p-7 — a different sequence from
    // the arrival order asserted below.
    const outOfOrderIds = ['p-9', 'p-5', 'p-7', 'p-2']
    let issued = 0
    const registry = new TableRegistry({
      clock: new FixedClock(1_000),
      rng: createRng(2026),
      newParticipantId: () => outOfOrderIds[issued++] as string,
      newToken: sequentialIds('t'),
      shard: 'A',
    })
    const table = newTable(registry)
    const first = registry.joinParticipant(table.code, undefined)
    if ('error' in first) throw new Error('join failed')
    registry.chooseGame(table.code, first.participant.id, 'tic-tac-toe', { min: 1, max: 3 })
    const second = registry.joinParticipant(table.code, undefined)
    const third = registry.joinParticipant(table.code, undefined)
    if ('error' in second || 'error' in third) {
      throw new Error('join failed')
    }

    // The first participant leaves and a fourth arrives, so the surviving
    // order can only come from tracking arrival, not from re-deriving it
    // from a fresh three-item sequence.
    registry.removeParticipant(table.code, first.participant.id)
    const fourth = registry.joinParticipant(table.code, undefined)
    if ('error' in fourth) throw new Error(fourth.error)

    const snapshot = registry.snapshot(fourth.table)

    expect(snapshot.participants.map((p) => p.id)).toEqual([
      second.participant.id,
      third.participant.id,
      fourth.participant.id,
    ])
    expect(snapshot.participants.map((p) => p.id)).toEqual(['p-5', 'p-7', 'p-2'])
  })
})

describe('TableRegistry reads the clock per operation', () => {
  it('stamps createdAt and joinedAt from the injected clock, read fresh each time', () => {
    const clock = new FixedClock(1_000)
    const registry = new TableRegistry({
      clock,
      rng: createRng(2026),
      newParticipantId: sequentialIds('p'),
      newToken: sequentialIds('t'),
      shard: 'A',
    })

    const table = newTable(registry)
    const first = registry.joinParticipant(table.code, undefined)
    if ('error' in first) throw new Error(first.error)

    expect(table.createdAt).toBe(1_000)
    expect(first.participant.joinedAt).toBe(1_000)

    registry.chooseGame(table.code, first.participant.id, 'tic-tac-toe', { min: 1, max: 2 })
    clock.advance(5_000)
    const second = registry.joinParticipant(table.code, undefined)
    if ('error' in second) throw new Error(second.error)

    expect(second.participant.joinedAt).toBe(6_000)
  })
})

describe('TableRegistry rejoin preserves the baton', () => {
  it('restores connected and keeps the baton when the holder rejoins with their token', () => {
    const registry = makeRegistry()
    const code = newTable(registry).code
    const host = registry.joinParticipant(code, undefined)
    if ('error' in host) throw new Error(host.error)

    registry.disconnectParticipant(code, host.participant.id)
    expect(registry.getTable(code)?.participants[0]?.connected).toBe(false)

    const again = registry.joinParticipant(code, host.participant.token)
    if ('error' in again) throw new Error(again.error)

    expect(again.participant.id).toBe(host.participant.id)
    expect(again.participant.connected).toBe(true)
    expect(registry.getTable(code)?.batonHolderId).toBe(host.participant.id)
  })
})

describe('TableRegistry capacity', () => {
  it('fills up to MAX_PARTICIPANTS', () => {
    const registry = makeRegistry()
    const code = newTable(registry).code
    const host = registry.joinParticipant(code, undefined)
    if ('error' in host) throw new Error(host.error)
    registry.chooseGame(code, host.participant.id, 'tic-tac-toe', { min: 1, max: MAX_PARTICIPANTS })

    for (let i = 1; i < MAX_PARTICIPANTS; i += 1) {
      const result = registry.joinParticipant(code, undefined)
      if ('error' in result) throw new Error(`join ${i} failed: ${result.error}`)
    }

    expect(registry.getTable(code)?.participants).toHaveLength(MAX_PARTICIPANTS)
  })

  it('refuses the participant after that with table-full', () => {
    const registry = makeRegistry()
    const code = newTable(registry).code
    const host = registry.joinParticipant(code, undefined)
    if ('error' in host) throw new Error(host.error)
    registry.chooseGame(code, host.participant.id, 'tic-tac-toe', { min: 1, max: MAX_PARTICIPANTS })
    for (let i = 1; i < MAX_PARTICIPANTS; i += 1) registry.joinParticipant(code, undefined)

    const overflow = registry.joinParticipant(code, undefined)

    expect(overflow).toEqual({ error: 'table-full' })
    expect(registry.getTable(code)?.participants).toHaveLength(MAX_PARTICIPANTS)
  })

  it('still lets someone already at a full table rejoin with their token', () => {
    const registry = makeRegistry()
    const code = newTable(registry).code
    const host = registry.joinParticipant(code, undefined)
    if ('error' in host) throw new Error(host.error)
    registry.chooseGame(code, host.participant.id, 'tic-tac-toe', { min: 1, max: MAX_PARTICIPANTS })
    for (let i = 1; i < MAX_PARTICIPANTS; i += 1) registry.joinParticipant(code, undefined)
    registry.disconnectParticipant(code, host.participant.id)

    // A rejoin takes no new place: the participant already holds one.
    const again = registry.joinParticipant(code, host.participant.token)
    if ('error' in again) throw new Error(again.error)

    expect(again.participant.id).toBe(host.participant.id)
    expect(registry.getTable(code)?.participants).toHaveLength(MAX_PARTICIPANTS)
  })

  it('frees the place again when someone leaves', () => {
    const registry = makeRegistry()
    const code = newTable(registry).code
    const host = registry.joinParticipant(code, undefined)
    if ('error' in host) throw new Error(host.error)
    registry.chooseGame(code, host.participant.id, 'tic-tac-toe', { min: 1, max: MAX_PARTICIPANTS })
    for (let i = 1; i < MAX_PARTICIPANTS; i += 1) registry.joinParticipant(code, undefined)

    registry.removeParticipant(code, host.participant.id)
    const newcomer = registry.joinParticipant(code, undefined)

    expect('error' in newcomer).toBe(false)
  })
})

describe('the round marker', () => {
  it('starts at one', () => {
    const registry = makeRegistry()
    expect(newTable(registry).round).toBe(1)
  })

  it('admits a phone presenting the current round', () => {
    const registry = makeRegistry()
    const table = newTable(registry)
    const result = registry.joinParticipant(table.code, undefined, table.round)
    expect('error' in result).toBe(false)
  })

  it('refuses a phone presenting a stale round', () => {
    const registry = makeRegistry()
    const table = newTable(registry)
    expect(registry.joinParticipant(table.code, undefined, 0)).toEqual({ error: 'stale-round' })
  })

  /**
   * The claim `Table.round`'s own documentation now makes, pinned rather than
   * asserted in prose: nothing this milestone can do moves it. It is meant to
   * advance when the table clears its seats, and the two actions that clear
   * them — "Clear seats" and "Change game" — end a match, which needs a match
   * to end. Both belong to Plan 3. This is what fails if a bump is ever added
   * without the trigger it belongs to, or the comment starts describing
   * something the code does not do again.
   */
  it('never moves, because nothing in this milestone clears the seats', () => {
    const registry = makeRegistry()
    const code = newTable(registry).code
    const host = join(registry, code)
    registry.setProfile(code, host.id, 'Ana', AVATARS[0]!.id)
    registry.previewGame(code, host.id, 'tic-tac-toe')
    registry.setPreviewPage(code, host.id, 1)
    registry.chooseGame(code, host.id, 'tic-tac-toe', { min: 2, max: 2 })
    const second = join(registry, code)
    registry.setHostPlaying(code, host.id, false)
    registry.setHostPlaying(code, host.id, true)
    registry.disconnectParticipant(code, second.id)
    registry.removeParticipant(code, second.id)
    registry.removeParticipant(code, host.id)

    expect(registry.getTable(code)?.round).toBe(1)
  })

  it('admits a phone presenting no round at all, which is a deliberate arrival', () => {
    const registry = makeRegistry()
    const table = newTable(registry)
    const result = registry.joinParticipant(table.code, undefined, undefined)
    expect('error' in result).toBe(false)
  })
})

describe('TableRegistry code exhaustion', () => {
  /**
   * No table is ever evicted today, so a long-lived process can in principle
   * fill the code space. Unbounded retrying would hang the event loop with no
   * message at all, and throwing would kill a process whose only caller is a
   * socket event listener with no catch above it. A refusal in the return
   * value is the only one of the three a screen can be told about.
   *
   * Note what the refusal does and does not mean: the registry gives up after
   * a fixed number of redraws, so it is a bound on effort, not a proof that
   * every code is taken. Opening a table again right afterwards may well
   * succeed. That is why this returns the first refusal rather than leaving
   * the registry in some supposedly terminal state.
   */
  function untilRefused(registry: TableRegistry): DomainError | null {
    for (let i = 0; i < 100_000; i += 1) {
      const result = registry.openTable()
      if ('error' in result) return result.error
    }
    return null
  }

  it('refuses rather than looping forever once codes run out', () => {
    expect(untilRefused(makeRegistry())).toBe('table-unavailable')
  })

  it('refuses by returning, so nothing above it needs a catch', () => {
    const registry = makeRegistry()
    untilRefused(registry)

    // The old behaviour threw here, out of a call the server makes from
    // inside a socket event listener with nothing catching above it.
    expect(() => {
      for (let i = 0; i < 1_000; i += 1) registry.openTable()
    }).not.toThrow()
  })

  it('still reopens a table that already exists once the space is crowded', () => {
    const registry = makeRegistry()
    const existing = newTable(registry)
    untilRefused(registry)

    // The refusal is about minting a code, not about serving a screen that
    // already has one: a television that reloads must still find its table.
    expect(registry.openTable(existing.code)).toEqual({ table: existing })
  })
})

const TIC_TAC_TOE = { min: 2, max: 2 }

describe('previewing a game', () => {
  it('puts the game on the table at its first page, for the baton holder', () => {
    const registry = makeRegistry()
    const code = newTable(registry).code
    const host = join(registry, code)
    registry.previewGame(code, host.id, 'tic-tac-toe')
    expect(registry.getTable(code)!.preview).toEqual({ gameId: 'tic-tac-toe', page: 0 })
  })

  it('is refused for anyone without the baton, and leaves the table unchanged', () => {
    const registry = makeRegistry()
    const code = newTable(registry).code
    join(registry, code)
    expect(registry.previewGame(code, 'not-the-host', 'tic-tac-toe')).toEqual({
      error: 'not-allowed',
    })
    expect(registry.getTable(code)!.preview).toBeNull()
  })

  it('is refused on an unknown table', () => {
    const registry = makeRegistry()
    expect(registry.previewGame('ZZZZ', 'nobody', 'tic-tac-toe')).toEqual({
      error: 'unknown-table',
    })
  })

  it('is refused for a seated participant who is not the baton holder', () => {
    const registry = makeRegistry()
    const code = newTable(registry).code
    const host = join(registry, code)
    registry.chooseGame(code, host.id, 'tic-tac-toe', TIC_TAC_TOE)
    const other = join(registry, code)

    expect(registry.previewGame(code, other.id, 'checkers')).toEqual({ error: 'not-allowed' })
  })

  it('is refused once a game is already chosen, even for the baton holder', () => {
    const registry = makeRegistry()
    const code = newTable(registry).code
    const host = join(registry, code)
    registry.chooseGame(code, host.id, 'tic-tac-toe', TIC_TAC_TOE)

    // chooseGame already cleared the preview. There is no path back to
    // browsing from seating, the same rule chooseGame enforces against a
    // second choice of its own.
    expect(registry.previewGame(code, host.id, 'checkers')).toEqual({ error: 'not-allowed' })
    expect(registry.getTable(code)!.preview).toBeNull()
  })
})

describe('turning the manual page', () => {
  it('moves the page of the game currently on preview', () => {
    const registry = makeRegistry()
    const code = newTable(registry).code
    const host = join(registry, code)
    registry.previewGame(code, host.id, 'tic-tac-toe')
    registry.setPreviewPage(code, host.id, 2)
    expect(registry.getTable(code)!.preview).toEqual({ gameId: 'tic-tac-toe', page: 2 })
  })

  it('is refused for anyone without the baton', () => {
    const registry = makeRegistry()
    const code = newTable(registry).code
    const host = join(registry, code)
    registry.previewGame(code, host.id, 'tic-tac-toe')
    expect(registry.setPreviewPage(code, 'not-the-host', 2)).toEqual({ error: 'not-allowed' })
    expect(registry.getTable(code)!.preview).toEqual({ gameId: 'tic-tac-toe', page: 0 })
  })

  it('is refused when nothing is on preview', () => {
    const registry = makeRegistry()
    const code = newTable(registry).code
    const host = join(registry, code)
    expect(registry.setPreviewPage(code, host.id, 1)).toEqual({ error: 'not-allowed' })
  })

  it('is refused on an unknown table', () => {
    const registry = makeRegistry()
    expect(registry.setPreviewPage('ZZZZ', 'nobody', 1)).toEqual({ error: 'unknown-table' })
  })

  it('is refused once a game is already chosen', () => {
    const registry = makeRegistry()
    const code = newTable(registry).code
    const host = join(registry, code)
    registry.chooseGame(code, host.id, 'tic-tac-toe', TIC_TAC_TOE)

    // Reachable only defensively: chooseGame already cleared the preview, so
    // the 'nothing on preview' guard above would catch this on its own.
    // This is the explicit rule stated anyway — mirroring chooseGame's own
    // re-invocation guard — rather than left to hold only by coincidence
    // with a different guard.
    expect(registry.setPreviewPage(code, host.id, 1)).toEqual({ error: 'not-allowed' })
  })
})

describe('choosing a game', () => {
  it('is refused for anyone without the baton', () => {
    const registry = makeRegistry()
    const code = newTable(registry).code
    join(registry, code)

    // Not a real second participant: joining before a game is chosen is
    // itself refused (see 'joining once a game is chosen' below), so a
    // non-baton id stands in to exercise chooseGame's own gate in isolation.
    expect(registry.chooseGame(code, 'not-the-host', 'tic-tac-toe', TIC_TAC_TOE)).toEqual({
      error: 'not-allowed',
    })
  })

  it('creates the game maximum in seats and moves to seating', () => {
    const registry = makeRegistry()
    const code = newTable(registry).code
    const host = join(registry, code)
    registry.chooseGame(code, host.id, 'tic-tac-toe', TIC_TAC_TOE)
    const table = registry.getTable(code)!
    expect(table.phase).toBe('seating')
    expect(table.seats).toHaveLength(2)
  })

  it('seats the host, because wanting to play is the common case', () => {
    const registry = makeRegistry()
    const code = newTable(registry).code
    const host = join(registry, code)
    registry.chooseGame(code, host.id, 'tic-tac-toe', TIC_TAC_TOE)
    expect(registry.getTable(code)!.seats[0]?.occupantId).toBe(host.id)
  })

  it('refuses a second choice once a game is already chosen', () => {
    const registry = makeRegistry()
    const code = newTable(registry).code
    const host = join(registry, code)
    registry.chooseGame(code, host.id, 'tic-tac-toe', TIC_TAC_TOE)
    const second = join(registry, code)

    // A repeat choice — plausible from a phone resending a tap it thinks
    // never landed — must not silently re-size the seats and orphan whoever
    // already claimed one.
    expect(registry.chooseGame(code, host.id, 'checkers', { min: 2, max: 6 })).toEqual({
      error: 'not-allowed',
    })
    expect(registry.getTable(code)!.seats).toHaveLength(2)
    expect(registry.getTable(code)!.seats[1]?.occupantId).toBe(second.id)
  })
})

describe('the host stepping out', () => {
  it('frees the seat', () => {
    const registry = makeRegistry()
    const code = newTable(registry).code
    const host = join(registry, code)
    registry.chooseGame(code, host.id, 'tic-tac-toe', TIC_TAC_TOE)
    registry.setHostPlaying(code, host.id, false)
    expect(registry.getTable(code)!.seats[0]?.occupantId).toBeNull()
  })

  it('lets him sit again while a seat is free', () => {
    const registry = makeRegistry()
    const code = newTable(registry).code
    const host = join(registry, code)
    registry.chooseGame(code, host.id, 'tic-tac-toe', TIC_TAC_TOE)
    registry.setHostPlaying(code, host.id, false)
    registry.setHostPlaying(code, host.id, true)
    expect(registry.getTable(code)!.seats[0]?.occupantId).toBe(host.id)
  })

  it('refuses to seat him when the table is full', () => {
    const registry = makeRegistry()
    const code = newTable(registry).code
    const host = join(registry, code)
    registry.chooseGame(code, host.id, 'tic-tac-toe', TIC_TAC_TOE)
    registry.setHostPlaying(code, host.id, false)
    join(registry, code)
    join(registry, code)
    expect(registry.setHostPlaying(code, host.id, true)).toEqual({ error: 'table-full' })
  })

  it('does not claim a second seat when a retried call finds him already seated', () => {
    const registry = makeRegistry()
    const code = newTable(registry).code
    const host = join(registry, code)
    registry.chooseGame(code, host.id, 'checkers', { min: 2, max: 4 })

    // chooseGame already seated him. A duplicate playing:true — plausible
    // from a reconnect-heavy client that resends its last intent — must not
    // claim a further, different seat for the same person.
    registry.setHostPlaying(code, host.id, true)

    const seats = registry.getTable(code)!.seats
    expect(seats.filter((seat) => seat.occupantId === host.id)).toHaveLength(1)
    expect(seats[1]?.occupantId).toBeNull()
  })

  it('lands in a later seat when someone has already taken the one he left', () => {
    const registry = makeRegistry()
    const code = newTable(registry).code
    const host = join(registry, code)
    registry.chooseGame(code, host.id, 'tic-tac-toe', TIC_TAC_TOE)
    registry.setHostPlaying(code, host.id, false)
    const other = join(registry, code)

    registry.setHostPlaying(code, host.id, true)

    const seats = registry.getTable(code)!.seats
    expect(seats[0]?.occupantId).toBe(other.id)
    expect(seats[1]?.occupantId).toBe(host.id)
  })
})

describe('joining once a game is chosen', () => {
  it('is refused before a game is chosen', () => {
    const registry = makeRegistry()
    const code = newTable(registry).code
    join(registry, code)
    expect(registry.joinParticipant(code, undefined, undefined)).toEqual({ error: 'not-allowed' })
  })

  it('claims a seat on arrival, before any nickname is set', () => {
    const registry = makeRegistry()
    const code = newTable(registry).code
    const host = join(registry, code)
    registry.chooseGame(code, host.id, 'tic-tac-toe', TIC_TAC_TOE)
    const second = join(registry, code)
    expect(registry.getTable(code)!.seats[1]?.occupantId).toBe(second.id)
    expect(second.nickname).toBe('')
  })

  it('refuses arrival number three at a two-seat table', () => {
    const registry = makeRegistry()
    const code = newTable(registry).code
    const host = join(registry, code)
    registry.chooseGame(code, host.id, 'tic-tac-toe', TIC_TAC_TOE)
    join(registry, code)
    expect(registry.joinParticipant(code, undefined, undefined)).toEqual({ error: 'table-full' })
  })
})

describe('the device view', () => {
  it('tells the baton holder he may choose a game, and nobody else', () => {
    const registry = makeRegistry()
    const code = newTable(registry).code
    const host = join(registry, code)
    const beforeChoosing = registry.getTable(code)!
    expect(registry.deviceView(beforeChoosing, host.id).canChooseGame).toBe(true)

    registry.chooseGame(code, host.id, 'tic-tac-toe', TIC_TAC_TOE)
    const other = join(registry, code)
    const table = registry.getTable(code)!
    expect(registry.deviceView(table, other.id).canChooseGame).toBe(false)
  })

  it('closes canChooseGame once a game is chosen, even for the baton holder', () => {
    // chooseGame itself refuses a second call once chosenGameId is set (see
    // 'choosing a game' > 'refuses a second choice once a game is already
    // chosen'). A DeviceView that still answered true here would offer an
    // action the domain is about to reject — the exact failure this split
    // exists to prevent.
    const registry = makeRegistry()
    const code = newTable(registry).code
    const host = join(registry, code)
    registry.chooseGame(code, host.id, 'tic-tac-toe', TIC_TAC_TOE)
    const table = registry.getTable(code)!
    expect(registry.deviceView(table, host.id).canChooseGame).toBe(false)
  })

  it('says how many more players are needed rather than the arithmetic', () => {
    const registry = makeRegistry()
    const code = newTable(registry).code
    const host = join(registry, code)
    registry.chooseGame(code, host.id, 'tic-tac-toe', TIC_TAC_TOE)
    const table = registry.getTable(code)!
    expect(registry.deviceView(table, host.id)).toMatchObject({
      canStart: false,
      playersNeeded: 1,
    })
  })

  it('carries nothing about the table', () => {
    const registry = makeRegistry()
    const code = newTable(registry).code
    const host = join(registry, code)
    registry.chooseGame(code, host.id, 'tic-tac-toe', TIC_TAC_TOE)
    const view = registry.deviceView(registry.getTable(code)!, host.id)
    expect(Object.keys(view).sort()).toEqual([
      'canChooseGame',
      'canStart',
      'hasBaton',
      'participantId',
      'phase',
      'playersNeeded',
      'seatNumber',
    ])
  })
})

describe('the table view', () => {
  it('shows the QR exactly while someone may join', () => {
    const registry = makeRegistry()
    const code = newTable(registry).code
    expect(registry.snapshot(registry.getTable(code)!).qrVisible).toBe(true)

    const host = join(registry, code)
    expect(registry.snapshot(registry.getTable(code)!).qrVisible).toBe(false)

    registry.chooseGame(code, host.id, 'tic-tac-toe', TIC_TAC_TOE)
    expect(registry.snapshot(registry.getTable(code)!).qrVisible).toBe(true)

    join(registry, code)
    expect(registry.snapshot(registry.getTable(code)!).qrVisible).toBe(false)
  })
})
