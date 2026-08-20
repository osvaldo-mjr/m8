import { PROTOCOL_VERSION, type ServerToClient } from '@m8/protocol'
import { FixedClock, TableRegistry, createRng, sequentialIds } from '@m8/core'
import { FakeTransport } from '@m8/transport'
import { beforeEach, describe, expect, it } from 'vitest'
import { Session } from './session.js'

let transport: FakeTransport
let registry: TableRegistry

beforeEach(() => {
  transport = new FakeTransport()
  registry = new TableRegistry({
    clock: new FixedClock(1_000),
    rng: createRng(2026),
    newParticipantId: sequentialIds('p'),
    newToken: sequentialIds('t'),
    shard: 'A',
  })
  new Session(transport, registry)
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
