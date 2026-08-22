import { PROTOCOL_VERSION, type ServerToClient } from '@m8/protocol'
import {
  FixedClock,
  MAX_PARTICIPANTS,
  TableRegistry,
  createRng,
  sequentialIds,
  type OpenTableResult,
} from '@m8/core'
import { FakeTransport } from '@m8/transport'
import { beforeEach, describe, expect, it } from 'vitest'
import type { ConnectionFault } from './faults.js'
import { Session } from './session.js'

let transport: FakeTransport
let registry: TableRegistry
let faults: ConnectionFault[]

beforeEach(() => {
  transport = new FakeTransport()
  faults = []
  registry = new TableRegistry({
    clock: new FixedClock(1_000),
    rng: createRng(2026),
    newParticipantId: sequentialIds('p'),
    newToken: sequentialIds('t'),
    shard: 'A',
  })
  new Session(transport, registry, (fault) => faults.push(fault))
})

function firstOfType<T extends ServerToClient['type']>(
  id: string,
  type: T,
): Extract<ServerToClient, { type: T }> {
  const found = transport.sentTo(id).find((m) => m.type === type)
  if (!found) throw new Error(`No ${type} sent to ${id}: ${JSON.stringify(transport.sentTo(id))}`)
  return found as Extract<ServerToClient, { type: T }>
}

describe('a screen connecting', () => {
  it('creates a table and reports its code', () => {
    transport.connect('tv')
    transport.receive('tv', { type: 'helloTable', protocolVersion: PROTOCOL_VERSION })

    const ready = firstOfType('tv', 'tableReady')
    expect(registry.getTable(ready.code)).toBeDefined()
  })

  it('sends the table state right after creating it', () => {
    transport.connect('tv')
    transport.receive('tv', { type: 'helloTable', protocolVersion: PROTOCOL_VERSION })

    const state = firstOfType('tv', 'tableState')
    expect(state.table.phase).toBe('awaiting-host')
  })

  it('rejoins the same table when the screen presents a known code', () => {
    transport.connect('tv')
    transport.receive('tv', { type: 'helloTable', protocolVersion: PROTOCOL_VERSION })
    const code = firstOfType('tv', 'tableReady').code

    transport.connect('tv-2')
    transport.receive('tv-2', { type: 'helloTable', protocolVersion: PROTOCOL_VERSION, code })

    expect(firstOfType('tv-2', 'tableReady').code).toBe(code)
  })

  it('creates a fresh table when the presented code is gone', () => {
    transport.connect('tv')
    transport.receive('tv', { type: 'helloTable', protocolVersion: PROTOCOL_VERSION, code: 'ZZZZ' })

    expect(firstOfType('tv', 'tableReady').code).not.toBe('ZZZZ')
  })

  it('tells a client with the wrong protocol version to reload', () => {
    transport.connect('tv')
    transport.receive('tv', { type: 'helloTable', protocolVersion: PROTOCOL_VERSION + 1 })

    expect(transport.sentTo('tv')).toContainEqual({ type: 'reload', reason: 'protocol-version' })
  })

  /**
   * A registry whose code space is full. Reaching that state for real needs
   * tens of thousands of live tables in one process, and the registry's own
   * tests already drive it there; what is under test here is only what the
   * session does with the refusal. Subclassed rather than faked so it is the
   * real class, with the real signature, that answers.
   */
  class FullRegistry extends TableRegistry {
    override openTable(): OpenTableResult {
      return { error: 'table-unavailable' }
    }
  }

  function sessionOnAFullRegistry(): void {
    transport = new FakeTransport()
    new Session(
      transport,
      new FullRegistry({
        clock: new FixedClock(1_000),
        rng: createRng(2026),
        newParticipantId: sequentialIds('p'),
        newToken: sequentialIds('t'),
        shard: 'A',
      }),
      (fault) => faults.push(fault),
    )
  }

  /**
   * This path used to throw out of a socket event listener that nothing
   * catches, which would have taken the server down and every other table in
   * it. The screen is told instead, and it already knows how to display an
   * error code — the only diagnostic surface a television has.
   */
  it('tells the screen the table is unavailable when no code can be opened', () => {
    sessionOnAFullRegistry()
    transport.connect('tv')

    expect(() => {
      transport.receive('tv', { type: 'helloTable', protocolVersion: PROTOCOL_VERSION })
    }).not.toThrow()
    expect(transport.sentTo('tv')).toContainEqual({ type: 'error', code: 'table-unavailable' })
  })

  it('promises the screen no table it cannot then hand over', () => {
    sessionOnAFullRegistry()
    transport.connect('tv')
    transport.receive('tv', { type: 'helloTable', protocolVersion: PROTOCOL_VERSION })

    // No tableReady and no state for a table that was never created: the
    // screen must not be left showing a code nobody can join.
    expect(transport.sentTo('tv').map((m) => m.type)).toEqual(['error'])
  })
})

describe('a phone joining', () => {
  function openTable(): string {
    transport.connect('tv')
    transport.receive('tv', { type: 'helloTable', protocolVersion: PROTOCOL_VERSION })
    return firstOfType('tv', 'tableReady').code
  }

  it('receives a welcome carrying a token', () => {
    const code = openTable()
    transport.connect('phone')
    transport.receive('phone', { type: 'hello', protocolVersion: PROTOCOL_VERSION, code })

    expect(firstOfType('phone', 'welcome').token).toBe('t-1')
  })

  it('errors on an unknown table', () => {
    transport.connect('phone')
    transport.receive('phone', { type: 'hello', protocolVersion: PROTOCOL_VERSION, code: 'ZZZZ' })

    expect(transport.sentTo('phone')).toContainEqual({ type: 'error', code: 'unknown-table' })
  })

  it('pushes the new state to the screen as well', () => {
    const code = openTable()
    transport.connect('phone')
    transport.receive('phone', { type: 'hello', protocolVersion: PROTOCOL_VERSION, code })

    const states = transport.sentTo('tv').filter((m) => m.type === 'tableState')
    const latest = states[states.length - 1]
    expect(latest?.type === 'tableState' && latest.table.participants).toHaveLength(1)
  })

  it('broadcasts the profile to the screen', () => {
    const code = openTable()
    transport.connect('phone')
    transport.receive('phone', { type: 'hello', protocolVersion: PROTOCOL_VERSION, code })
    transport.receive('phone', { type: 'setProfile', nickname: 'Ana', avatarId: 'fox' })

    const states = transport.sentTo('tv').filter((m) => m.type === 'tableState')
    const latest = states[states.length - 1]
    expect(latest?.type === 'tableState' && latest.table.participants[0]?.nickname).toBe('Ana')
  })

  it('marks the participant disconnected when the socket drops', () => {
    const code = openTable()
    transport.connect('phone')
    transport.receive('phone', { type: 'hello', protocolVersion: PROTOCOL_VERSION, code })
    transport.disconnect('phone')

    const states = transport.sentTo('tv').filter((m) => m.type === 'tableState')
    const latest = states[states.length - 1]
    expect(latest?.type === 'tableState' && latest.table.participants[0]?.connected).toBe(false)
  })

  it('removes the participant when they leave deliberately', () => {
    const code = openTable()
    transport.connect('phone')
    transport.receive('phone', { type: 'hello', protocolVersion: PROTOCOL_VERSION, code })
    transport.receive('phone', { type: 'leave' })

    const states = transport.sentTo('tv').filter((m) => m.type === 'tableState')
    const latest = states[states.length - 1]
    expect(latest?.type === 'tableState' && latest.table.participants).toHaveLength(0)
  })

  it('rejects a malformed message without crashing', () => {
    transport.connect('phone')
    transport.receive('phone', { type: 'launchMissiles' })

    expect(transport.sentTo('phone')).toContainEqual({ type: 'error', code: 'invalid-message' })
  })

  it('does not mark a participant disconnected when their earlier connection drops after a reconnect', () => {
    const code = openTable()

    transport.connect('phone-1')
    transport.receive('phone-1', { type: 'hello', protocolVersion: PROTOCOL_VERSION, code })
    const token = firstOfType('phone-1', 'welcome').token

    // The same phone rejoins on a fresh connection - a page reload - carrying
    // the token issued to the first one.
    transport.connect('phone-2')
    transport.receive('phone-2', { type: 'hello', protocolVersion: PROTOCOL_VERSION, code, token })

    // The stale first connection's disconnect arrives after the reconnect
    // already happened. It must not mark the still-live participant offline.
    transport.disconnect('phone-1')

    const states = transport.sentTo('tv').filter((m) => m.type === 'tableState')
    const latest = states[states.length - 1]
    expect(latest?.type === 'tableState' && latest.table.participants).toHaveLength(1)
    expect(latest?.type === 'tableState' && latest.table.participants[0]?.connected).toBe(true)
  })
})

describe('the TV-only invariant', () => {
  it('rejects helloTable from a connection already joined as a phone', () => {
    transport.connect('tv')
    transport.receive('tv', { type: 'helloTable', protocolVersion: PROTOCOL_VERSION })
    const code = firstOfType('tv', 'tableReady').code

    transport.connect('phone')
    transport.receive('phone', { type: 'hello', protocolVersion: PROTOCOL_VERSION, code })
    transport.receive('phone', { type: 'helloTable', protocolVersion: PROTOCOL_VERSION })

    expect(transport.sentTo('phone')).toContainEqual({ type: 'error', code: 'not-allowed' })
  })

  it('rejects hello from a connection already opened as a screen', () => {
    transport.connect('tv')
    transport.receive('tv', { type: 'helloTable', protocolVersion: PROTOCOL_VERSION })
    const code = firstOfType('tv', 'tableReady').code

    transport.receive('tv', { type: 'hello', protocolVersion: PROTOCOL_VERSION, code })

    expect(transport.sentTo('tv')).toContainEqual({ type: 'error', code: 'not-allowed' })
  })
})

describe('a full table', () => {
  it('answers table-full to the phone that arrives after the last place is taken', () => {
    transport.connect('tv')
    transport.receive('tv', { type: 'helloTable', protocolVersion: PROTOCOL_VERSION })
    const code = firstOfType('tv', 'tableReady').code

    transport.connect('phone-0')
    transport.receive('phone-0', { type: 'hello', protocolVersion: PROTOCOL_VERSION, code })

    // Only the host can join before a game is chosen. Choosing one directly
    // through the registry stands in for the wire message a later task adds
    // (see the working agreement: wiring chooseGame to the transport is out
    // of scope here), so the rest of the table can still fill up to capacity.
    const hostId = registry.getTable(code)?.batonHolderId
    if (!hostId) throw new Error('host did not receive the baton')
    registry.chooseGame(code, hostId, 'test-game', { min: 1, max: MAX_PARTICIPANTS })

    for (let i = 1; i < MAX_PARTICIPANTS; i += 1) {
      transport.connect(`phone-${i}`)
      transport.receive(`phone-${i}`, { type: 'hello', protocolVersion: PROTOCOL_VERSION, code })
    }

    transport.connect('phone-late')
    transport.receive('phone-late', { type: 'hello', protocolVersion: PROTOCOL_VERSION, code })

    expect(transport.sentTo('phone-late')).toEqual([{ type: 'error', code: 'table-full' }])
    expect(registry.getTable(code)?.participants).toHaveLength(MAX_PARTICIPANTS)
  })
})

describe('one connection speaks for one participant', () => {
  function openTable(): string {
    transport.connect('tv')
    transport.receive('tv', { type: 'helloTable', protocolVersion: PROTOCOL_VERSION })
    return firstOfType('tv', 'tableReady').code
  }

  it('refuses a second hello on a connection already speaking for a participant', () => {
    const code = openTable()
    transport.connect('phone')
    transport.receive('phone', { type: 'hello', protocolVersion: PROTOCOL_VERSION, code })
    transport.receive('phone', { type: 'hello', protocolVersion: PROTOCOL_VERSION, code })

    expect(transport.sentTo('phone')).toContainEqual({ type: 'error', code: 'not-allowed' })
    expect(registry.getTable(code)?.participants).toHaveLength(1)
  })

  it('mints no participant a repeated hello could orphan', () => {
    const code = openTable()
    transport.connect('phone')
    for (let i = 0; i < 5; i += 1) {
      transport.receive('phone', { type: 'hello', protocolVersion: PROTOCOL_VERSION, code })
    }

    const table = registry.getTable(code)
    expect(table?.participants).toHaveLength(1)
    // Only one welcome was ever issued, so the device holds exactly one token.
    expect(transport.sentTo('phone').filter((m) => m.type === 'welcome')).toHaveLength(1)
  })

  it('leaves nobody connected and nobody holding the baton after that connection drops', () => {
    const code = openTable()
    transport.connect('phone')
    for (let i = 0; i < 5; i += 1) {
      transport.receive('phone', { type: 'hello', protocolVersion: PROTOCOL_VERSION, code })
    }
    transport.disconnect('phone')

    const table = registry.getTable(code)
    expect(table?.participants.filter((p) => p.connected)).toHaveLength(0)
    // The baton is held by the one participant that exists, not by a ghost
    // no connection will ever speak for again.
    expect(table?.batonHolderId).toBe(table?.participants[0]?.id)
  })
})

describe('the catalogue and seats messages', () => {
  function openTable(): string {
    transport.connect('tv')
    transport.receive('tv', { type: 'helloTable', protocolVersion: PROTOCOL_VERSION })
    return firstOfType('tv', 'tableReady').code
  }

  function joinPhone(id: string, code: string): string {
    transport.connect(id)
    transport.receive(id, { type: 'hello', protocolVersion: PROTOCOL_VERSION, code })
    return firstOfType(id, 'welcome').participantId
  }

  it('sends the screen a tableState and never a deviceState', () => {
    openTable()

    const types = transport.sentTo('tv').map((m) => m.type)
    expect(types).toContain('tableState')
    expect(types).not.toContain('deviceState')
  })

  it('sends a phone a deviceState and never a tableState', () => {
    const code = openTable()
    joinPhone('host', code)

    // Asserting on the message *types* the fake transport recorded, not on
    // any payload's contents: this is what would fail if a filtered table
    // were ever built for a phone, whatever shape it took.
    const types = transport.sentTo('host').map((m) => m.type)
    expect(types).toContain('deviceState')
    expect(types).not.toContain('tableState')
  })

  it('lets the baton holder put a preview on the table', () => {
    const code = openTable()
    joinPhone('host', code)

    transport.receive('host', { type: 'previewGame', gameId: 'tic-tac-toe' })

    expect(registry.getTable(code)!.preview).toEqual({ gameId: 'tic-tac-toe', page: 0 })
  })

  it('refuses previewGame from a seated participant who does not hold the baton', () => {
    const code = openTable()
    joinPhone('host', code)
    transport.receive('host', { type: 'chooseGame', gameId: 'tic-tac-toe' })
    joinPhone('other', code)

    transport.receive('other', { type: 'previewGame', gameId: 'checkers' })

    expect(transport.sentTo('other')).toContainEqual({ type: 'error', code: 'not-allowed' })
    // chooseGame already cleared the preview; the refused call must not have
    // put a new one there.
    expect(registry.getTable(code)!.preview).toBeNull()
  })

  it('moves the preview page within range', () => {
    const code = openTable()
    joinPhone('host', code)
    transport.receive('host', { type: 'previewGame', gameId: 'tic-tac-toe' })

    transport.receive('host', { type: 'manualPage', page: 1 })

    expect(registry.getTable(code)!.preview).toEqual({ gameId: 'tic-tac-toe', page: 1 })
  })

  it('clamps a manualPage beyond the last page rather than erroring', () => {
    const code = openTable()
    joinPhone('host', code)
    transport.receive('host', { type: 'previewGame', gameId: 'tic-tac-toe' })

    // tic-tac-toe's manual carries three pages in each locale: index 2 is
    // the last.
    transport.receive('host', { type: 'manualPage', page: 99 })

    expect(registry.getTable(code)!.preview).toEqual({ gameId: 'tic-tac-toe', page: 2 })
    expect(transport.sentTo('host')).not.toContainEqual(
      expect.objectContaining({ type: 'error' }),
    )
  })

  it('clamps a manualPage below zero to the first page rather than erroring', () => {
    const code = openTable()
    joinPhone('host', code)
    transport.receive('host', { type: 'previewGame', gameId: 'tic-tac-toe' })
    transport.receive('host', { type: 'manualPage', page: 1 })

    transport.receive('host', { type: 'manualPage', page: -5 })

    expect(registry.getTable(code)!.preview).toEqual({ gameId: 'tic-tac-toe', page: 0 })
  })

  it('creates seats via chooseGame and tells every device', () => {
    const code = openTable()
    joinPhone('host', code)

    transport.receive('host', { type: 'chooseGame', gameId: 'tic-tac-toe' })

    const table = registry.getTable(code)!
    expect(table.phase).toBe('seating')
    expect(table.seats).toHaveLength(2)

    const hostDeviceMessages = transport.sentTo('host').filter((m) => m.type === 'deviceState')
    const latestHostDevice = hostDeviceMessages[hostDeviceMessages.length - 1]
    expect(latestHostDevice?.type === 'deviceState' && latestHostDevice.device.seatNumber).toBe(1)

    const screenStates = transport.sentTo('tv').filter((m) => m.type === 'tableState')
    const latestScreen = screenStates[screenStates.length - 1]
    expect(latestScreen?.type === 'tableState' && latestScreen.table.seats).toHaveLength(2)
  })

  it('refuses chooseGame naming a game outside the catalogue, leaving the table unchanged', () => {
    const code = openTable()
    joinPhone('host', code)

    transport.receive('host', { type: 'chooseGame', gameId: 'backgammon' })

    const table = registry.getTable(code)!
    expect(table.chosenGameId).toBeNull()
    expect(table.phase).toBe('choosing-game')
    expect(transport.sentTo('host')).toContainEqual({ type: 'error', code: 'not-allowed' })
  })

  it('refuses chooseGame for a game whose manifest is coming-soon, leaving the table unchanged', () => {
    // 'chess' is in the catalogue but its manifest carries status
    // 'coming-soon' (packages/games/chess/src/manifest.ts) — unlike
    // 'backgammon' above, findManifest resolves it, so only a status check
    // catches this. Without the guard, seats would be created for a game
    // with no rules to ever start.
    const code = openTable()
    joinPhone('host', code)

    transport.receive('host', { type: 'chooseGame', gameId: 'chess' })

    const table = registry.getTable(code)!
    expect(table.chosenGameId).toBeNull()
    expect(table.seats).toHaveLength(0)
    expect(table.phase).toBe('choosing-game')
    expect(transport.sentTo('host')).toContainEqual({ type: 'error', code: 'not-allowed' })
  })

  it('still allows previewing a coming-soon game — only choosing it is refused', () => {
    const code = openTable()
    joinPhone('host', code)

    transport.receive('host', { type: 'previewGame', gameId: 'chess' })

    expect(registry.getTable(code)!.preview).toEqual({ gameId: 'chess', page: 0 })
    expect(transport.sentTo('host')).not.toContainEqual(
      expect.objectContaining({ type: 'error' }),
    )
  })

  it('refuses a phone joining before a game is chosen', () => {
    const code = openTable()
    joinPhone('host', code)

    transport.connect('second')
    transport.receive('second', { type: 'hello', protocolVersion: PROTOCOL_VERSION, code })

    expect(transport.sentTo('second')).toContainEqual({ type: 'error', code: 'not-allowed' })
  })

  it('refuses a phone presenting a stale round', () => {
    const code = openTable()

    transport.connect('host')
    transport.receive('host', { type: 'hello', protocolVersion: PROTOCOL_VERSION, code, round: 0 })

    expect(transport.sentTo('host')).toContainEqual({ type: 'error', code: 'stale-round' })
  })

  it('rejects a fractional manualPage instead of crashing the table', () => {
    const code = openTable()
    joinPhone('host', code)
    transport.receive('host', { type: 'previewGame', gameId: 'tic-tac-toe' })

    expect(() => {
      transport.receive('host', { type: 'manualPage', page: 1.5 })
    }).not.toThrow()

    expect(transport.sentTo('host')).toContainEqual({ type: 'error', code: 'invalid-message' })
    // The malformed message must not have moved the page it could not resolve.
    expect(registry.getTable(code)!.preview).toEqual({ gameId: 'tic-tac-toe', page: 0 })
  })

  it('refuses previewGame from the baton holder once a game is already chosen', () => {
    const code = openTable()
    joinPhone('host', code)
    transport.receive('host', { type: 'chooseGame', gameId: 'tic-tac-toe' })

    transport.receive('host', { type: 'previewGame', gameId: 'checkers' })

    expect(transport.sentTo('host')).toContainEqual({ type: 'error', code: 'not-allowed' })
    // chooseGame already cleared the preview; a stray previewGame after
    // seating has opened must not put a new one there.
    expect(registry.getTable(code)!.preview).toBeNull()
  })
})

/**
 * One device failing to receive is one device's problem. A broadcast reaches
 * several connections in turn, so a send that throws part-way through would
 * otherwise leave every device after it in the loop holding state from before
 * the change — with no further message coming, because the server believes it
 * already sent one. The television is usually first in that loop, which is the
 * worst version of it: the room's shared source of truth stops moving while the
 * table itself does not.
 *
 * The guard is deliberately only around the send. Building the message for a
 * recipient stays outside it, so a domain bug in a projection still surfaces as
 * a red test rather than being quietly swallowed for every recipient at once.
 */
describe('a broadcast to a connection that cannot receive', () => {
  it('still reaches the other devices, and reports the fault', () => {
    const screen = transport.connect('tv')
    transport.receive('tv', { type: 'helloTable', protocolVersion: PROTOCOL_VERSION })
    const code = firstOfType('tv', 'tableReady').code

    // The very object the session holds, broken after it was attached: the
    // connection is live and belongs to the table, and only its delivery
    // fails — the shape of a socket whose peer has gone without saying so.
    screen.send = () => {
      throw new Error('socket write failed')
    }

    transport.connect('host')
    transport.receive('host', { type: 'hello', protocolVersion: PROTOCOL_VERSION, code })

    expect(transport.sentTo('host').map((m) => m.type)).toContain('deviceState')
    const fault = faults.find((candidate) => candidate.stage === 'sending')
    expect(fault?.connectionId).toBe('tv')
    expect(fault?.error.stack).toContain('socket write failed')
  })
})
