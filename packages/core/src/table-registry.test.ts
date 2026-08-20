import { beforeEach, describe, expect, it } from 'vitest'
import { FixedClock } from './clock.js'
import { sequentialIds } from './ids.js'
import { createRng } from './rng.js'
import { TableRegistry } from './table-registry.js'

function makeRegistry(): TableRegistry {
  return new TableRegistry({
    clock: new FixedClock(1_000),
    rng: createRng(2026),
    newParticipantId: sequentialIds('p'),
    newToken: sequentialIds('t'),
    shard: 'A',
  })
}

describe('TableRegistry.createTable', () => {
  let registry: TableRegistry

  beforeEach(() => {
    registry = makeRegistry()
  })

  it('creates a table awaiting a host', () => {
    const table = registry.createTable()
    expect(table.phase).toBe('awaiting-host')
    expect(table.participants).toEqual([])
    expect(table.batonHolderId).toBeNull()
  })

  it('creates tables with distinct codes', () => {
    const first = registry.createTable()
    const second = registry.createTable()
    expect(first.code).not.toBe(second.code)
  })

  it('finds a table by its code', () => {
    const table = registry.createTable()
    expect(registry.getTable(table.code)).toBe(table)
  })

  it('finds a table by a lowercase code', () => {
    const table = registry.createTable()
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
    const table = registry.openTable()
    expect(table.phase).toBe('awaiting-host')
    expect(registry.getTable(table.code)).toBe(table)
  })

  it('reopens the same table for a known code', () => {
    const original = registry.createTable()
    const reopened = registry.openTable(original.code)
    expect(reopened).toBe(original)
  })

  it('creates a fresh table when the given code is unknown', () => {
    const table = registry.openTable('ZZZZ')
    expect(table.code).not.toBe('ZZZZ')
    expect(registry.getTable(table.code)).toBe(table)
  })
})

describe('TableRegistry.joinParticipant', () => {
  let registry: TableRegistry
  let code: string

  beforeEach(() => {
    registry = makeRegistry()
    code = registry.createTable().code
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
    expect(result.events).toContainEqual({
      type: 'baton-granted',
      code,
      participantId: result.participant.id,
    })
  })

  it('moves the table to choosing-game once a host arrives', () => {
    const result = registry.joinParticipant(code, undefined)
    if ('error' in result) throw new Error(result.error)
    expect(result.table.phase).toBe('choosing-game')
  })

  it('does not give the baton to the second participant', () => {
    const first = registry.joinParticipant(code, undefined)
    const second = registry.joinParticipant(code, undefined)
    if ('error' in first || 'error' in second) throw new Error('join failed')

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
    expect(again.events).toContainEqual({
      type: 'participant-rejoined',
      code,
      participantId: first.participant.id,
    })
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
    const code = registry.createTable().code
    const joined = registry.joinParticipant(code, undefined)
    if ('error' in joined) throw new Error(joined.error)

    const events = registry.disconnectParticipant(code, joined.participant.id)

    expect(events).toContainEqual({
      type: 'participant-disconnected',
      code,
      participantId: joined.participant.id,
    })
    expect(registry.getTable(code)?.participants).toHaveLength(1)
    expect(registry.getTable(code)?.participants[0]?.connected).toBe(false)
  })

  it('never changes the baton holder when the holder disconnects', () => {
    const registry = makeRegistry()
    const code = registry.createTable().code
    const host = registry.joinParticipant(code, undefined)
    if ('error' in host) throw new Error(host.error)

    const events = registry.disconnectParticipant(code, host.participant.id)

    expect(registry.getTable(code)?.batonHolderId).toBe(host.participant.id)
    expect(events.some((event) => event.type.startsWith('baton-'))).toBe(false)
  })

  it('never changes the baton holder when a non-holder disconnects', () => {
    const registry = makeRegistry()
    const code = registry.createTable().code
    const host = registry.joinParticipant(code, undefined)
    const second = registry.joinParticipant(code, undefined)
    if ('error' in host || 'error' in second) throw new Error('join failed')

    const events = registry.disconnectParticipant(code, second.participant.id)

    expect(registry.getTable(code)?.batonHolderId).toBe(host.participant.id)
    expect(events.some((event) => event.type.startsWith('baton-'))).toBe(false)
  })
})

describe('TableRegistry.removeParticipant', () => {
  it('migrates the baton to the longest-present survivor', () => {
    const registry = makeRegistry()
    const code = registry.createTable().code
    const host = registry.joinParticipant(code, undefined)
    const second = registry.joinParticipant(code, undefined)
    if ('error' in host || 'error' in second) throw new Error('join failed')

    const events = registry.removeParticipant(code, host.participant.id)

    expect(registry.getTable(code)?.batonHolderId).toBe(second.participant.id)
    expect(events).toContainEqual({
      type: 'baton-migrated',
      code,
      participantId: second.participant.id,
    })
  })

  it('returns the table to awaiting-host when the last participant leaves', () => {
    const registry = makeRegistry()
    const code = registry.createTable().code
    const host = registry.joinParticipant(code, undefined)
    if ('error' in host) throw new Error(host.error)

    const events = registry.removeParticipant(code, host.participant.id)

    const table = registry.getTable(code)
    expect(table?.phase).toBe('awaiting-host')
    expect(table?.batonHolderId).toBeNull()
    expect(events).toContainEqual({ type: 'table-emptied', code })
  })

  it('leaves the baton untouched and emits no baton event when a non-holder leaves', () => {
    const registry = makeRegistry()
    const code = registry.createTable().code
    const host = registry.joinParticipant(code, undefined)
    const second = registry.joinParticipant(code, undefined)
    if ('error' in host || 'error' in second) throw new Error('join failed')

    const events = registry.removeParticipant(code, second.participant.id)

    expect(registry.getTable(code)?.batonHolderId).toBe(host.participant.id)
    expect(events.some((event) => event.type.startsWith('baton-'))).toBe(false)
  })
})

describe('TableRegistry.setProfile', () => {
  it('stores the nickname and avatar', () => {
    const registry = makeRegistry()
    const code = registry.createTable().code
    const joined = registry.joinParticipant(code, undefined)
    if ('error' in joined) throw new Error(joined.error)

    registry.setProfile(code, joined.participant.id, 'Ana', 'fox')

    const table = registry.getTable(code)
    expect(table?.participants[0]?.nickname).toBe('Ana')
    expect(table?.participants[0]?.avatarId).toBe('fox')
  })

  it('trims and truncates an over-long nickname', () => {
    const registry = makeRegistry()
    const code = registry.createTable().code
    const joined = registry.joinParticipant(code, undefined)
    if ('error' in joined) throw new Error(joined.error)

    registry.setProfile(code, joined.participant.id, `   ${'x'.repeat(50)}   `, 'fox')

    expect(registry.getTable(code)?.participants[0]?.nickname).toHaveLength(16)
  })
})

describe('TableRegistry.snapshot', () => {
  it('reports the baton holder', () => {
    const registry = makeRegistry()
    const table = registry.createTable()
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
    const table = registry.createTable()
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

  it('preserves arrival order', () => {
    const registry = makeRegistry()
    const table = registry.createTable()
    const first = registry.joinParticipant(table.code, undefined)
    const second = registry.joinParticipant(table.code, undefined)
    const third = registry.joinParticipant(table.code, undefined)
    if ('error' in first || 'error' in second || 'error' in third) {
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

    const table = registry.createTable()
    const first = registry.joinParticipant(table.code, undefined)
    if ('error' in first) throw new Error(first.error)

    expect(table.createdAt).toBe(1_000)
    expect(first.participant.joinedAt).toBe(1_000)

    clock.advance(5_000)
    const second = registry.joinParticipant(table.code, undefined)
    if ('error' in second) throw new Error(second.error)

    expect(second.participant.joinedAt).toBe(6_000)
  })
})

describe('TableRegistry rejoin preserves the baton', () => {
  it('restores connected and keeps the baton when the holder rejoins with their token', () => {
    const registry = makeRegistry()
    const code = registry.createTable().code
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
