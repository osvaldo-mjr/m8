import { createServer, type Server as HttpServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { FixedClock, TableRegistry, createRng, sequentialIds } from '@m8/core'
import { PROTOCOL_VERSION, type ServerToClient, type TableSnapshot } from '@m8/protocol'
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Session } from './session.js'
import { SocketIoTransport, type TransportNegotiation } from './socket-transport.js'

/**
 * Proves the real Socket.IO adapter honours the same contract session.test.ts
 * already proves against FakeTransport — built against a bare node:http
 * server plus a real Session, not through buildApp, since buildApp serves
 * static roots that do not exist until later tasks. Real sockets, real
 * network round trips, no fake in sight.
 *
 * `socket-transport.ts` is the only file that imports the `socket.io` server
 * package; this file only reaches for `socket.io-client`, a separate package,
 * to play the part of a real device on the other end of the wire.
 */

const CHANNEL = 'm8'

let httpServer: HttpServer
let transport: SocketIoTransport
let baseUrl: string
const clients: ClientSocket[] = []
const negotiations: TransportNegotiation[] = []

interface TrackedClient {
  readonly socket: ClientSocket
  readonly messages: ServerToClient[]
}

beforeEach(async () => {
  httpServer = createServer()

  const registry = new TableRegistry({
    clock: new FixedClock(1_000),
    rng: createRng(2026),
    newParticipantId: sequentialIds('p'),
    newToken: sequentialIds('t'),
    shard: 'A',
  })
  negotiations.length = 0
  transport = new SocketIoTransport(httpServer, (n) => negotiations.push(n))
  new Session(transport, registry)

  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve))
  const address = httpServer.address() as AddressInfo
  baseUrl = `http://127.0.0.1:${address.port}`
})

afterEach(async () => {
  for (const client of clients) client.close()
  clients.length = 0
  await transport.close()
  await new Promise<void>((resolve) => httpServer.close(() => resolve()))
})

function connect(): TrackedClient {
  const socket = ioClient(baseUrl)
  clients.push(socket)
  const messages: ServerToClient[] = []
  // Attached before the socket even finishes connecting, so nothing sent in
  // response to a message we are about to emit can arrive before we are
  // listening for it.
  socket.on(CHANNEL, (message: ServerToClient) => messages.push(message))
  return { socket, messages }
}

function waitForConnect(socket: ClientSocket): Promise<void> {
  if (socket.connected) return Promise.resolve()
  return new Promise((resolve) => socket.once('connect', resolve))
}

async function waitFor<T>(check: () => T | undefined, timeoutMs = 2_000): Promise<T> {
  const start = Date.now()
  for (;;) {
    const result = check()
    if (result !== undefined) return result
    if (Date.now() - start > timeoutMs) throw new Error('Timed out waiting for a condition')
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

function waitForType<T extends ServerToClient['type']>(
  messages: readonly ServerToClient[],
  type: T,
): Promise<Extract<ServerToClient, { type: T }>> {
  return waitFor(() => messages.find((m) => m.type === type)) as Promise<Extract<ServerToClient, { type: T }>>
}

function waitForState(
  messages: readonly ServerToClient[],
  predicate: (table: TableSnapshot) => boolean,
): Promise<TableSnapshot> {
  return waitFor(() => {
    const states = messages.filter((m): m is Extract<ServerToClient, { type: 'tableState' }> => m.type === 'tableState')
    const latest = states[states.length - 1]
    return latest && predicate(latest.table) ? latest.table : undefined
  })
}

async function openTable(): Promise<{ screen: TrackedClient; code: string }> {
  const screen = connect()
  await waitForConnect(screen.socket)
  screen.socket.emit(CHANNEL, { type: 'helloTable', protocolVersion: PROTOCOL_VERSION })
  const ready = await waitForType(screen.messages, 'tableReady')
  return { screen, code: ready.code }
}

describe('the real Socket.IO transport', () => {
  it('sends tableReady then tableState to a screen that connects', async () => {
    const screen = connect()
    await waitForConnect(screen.socket)
    screen.socket.emit(CHANNEL, { type: 'helloTable', protocolVersion: PROTOCOL_VERSION })

    await waitForType(screen.messages, 'tableState')
    expect(screen.messages[0]?.type).toBe('tableReady')
    expect(screen.messages[1]?.type).toBe('tableState')
  })

  it('welcomes a joining phone with a token and updates the screen', async () => {
    const { screen, code } = await openTable()

    const phone = connect()
    await waitForConnect(phone.socket)
    phone.socket.emit(CHANNEL, { type: 'hello', protocolVersion: PROTOCOL_VERSION, code })

    const welcome = await waitForType(phone.messages, 'welcome')
    expect(welcome.token).toBeTruthy()

    const table = await waitForState(screen.messages, (t) => t.participants.length === 1)
    expect(table.participants[0]?.id).toBe(welcome.participantId)
  })

  it('reflects a profile set by the phone to the screen', async () => {
    const { screen, code } = await openTable()

    const phone = connect()
    await waitForConnect(phone.socket)
    phone.socket.emit(CHANNEL, { type: 'hello', protocolVersion: PROTOCOL_VERSION, code })
    await waitForType(phone.messages, 'welcome')

    phone.socket.emit(CHANNEL, { type: 'setProfile', nickname: 'Ana', avatarId: 'fox' })

    const table = await waitForState(screen.messages, (t) => t.participants[0]?.nickname === 'Ana')
    expect(table.participants[0]?.avatarId).toBe('fox')
  })

  it('marks the participant not connected when the phone socket drops', async () => {
    const { screen, code } = await openTable()

    const phone = connect()
    await waitForConnect(phone.socket)
    phone.socket.emit(CHANNEL, { type: 'hello', protocolVersion: PROTOCOL_VERSION, code })
    await waitForType(phone.messages, 'welcome')

    // A real drop, not a deliberate leave: the client-side socket closes, and
    // the server must notice on its own. This is the path where the fake was
    // once found to diverge from the real transport.
    phone.socket.close()

    const table = await waitForState(screen.messages, (t) => t.participants[0]?.connected === false)
    expect(table.participants).toHaveLength(1)
  })

  it('keeps a reconnected phone marked connected when its earlier socket drops later', async () => {
    const { screen, code } = await openTable()

    const firstSocket = connect()
    await waitForConnect(firstSocket.socket)
    firstSocket.socket.emit(CHANNEL, { type: 'hello', protocolVersion: PROTOCOL_VERSION, code })
    const firstWelcome = await waitForType(firstSocket.messages, 'welcome')

    // The same phone rejoins on a fresh socket - the shape of a page reload -
    // carrying the token the first connection was issued.
    const secondSocket = connect()
    await waitForConnect(secondSocket.socket)
    secondSocket.socket.emit(CHANNEL, {
      type: 'hello',
      protocolVersion: PROTOCOL_VERSION,
      code,
      token: firstWelcome.token,
    })
    const secondWelcome = await waitForType(secondSocket.messages, 'welcome')
    expect(secondWelcome.participantId).toBe(firstWelcome.participantId)

    const screenMessagesBeforeDrop = screen.messages.length

    // The stale first socket's disconnect arrives sometime after the
    // reconnect - a real network teardown, not a deliberate leave. This is
    // the ordering an in-memory fake cannot exercise: session.test.ts proves
    // the same claim deterministically against FakeTransport, and this test
    // proves it holds when the drop is a real, independently-timed socket
    // event rather than a synchronous call.
    firstSocket.socket.close()

    // A bounded settle window, not a substitute for a condition: this
    // assertion is about the *absence* of a wrongful broadcast, which cannot
    // be expressed as "wait until X appears". The sibling "drops" test above
    // establishes that a real disconnect is normally observed well within
    // this budget, so anything that should have arrived already has.
    await new Promise((resolve) => setTimeout(resolve, 300))

    const statesSinceReconnect = screen.messages
      .slice(screenMessagesBeforeDrop)
      .filter((m): m is Extract<ServerToClient, { type: 'tableState' }> => m.type === 'tableState')
    for (const state of statesSinceReconnect) {
      expect(state.table.participants).toHaveLength(1)
      expect(state.table.participants[0]?.connected).toBe(true)
    }

    // And, right now, the table is still correct: exactly the reconnected
    // participant, still connected.
    const allStates = screen.messages.filter(
      (m): m is Extract<ServerToClient, { type: 'tableState' }> => m.type === 'tableState',
    )
    const latest = allStates[allStates.length - 1]
    expect(latest?.table.participants).toHaveLength(1)
    expect(latest?.table.participants[0]?.connected).toBe(true)
  })

  it('answers a malformed message with invalid-message instead of crashing', async () => {
    const phone = connect()
    await waitForConnect(phone.socket)
    phone.socket.emit(CHANNEL, { type: 'launchMissiles' })

    const error = await waitForType(phone.messages, 'error')
    expect(error).toEqual({ type: 'error', code: 'invalid-message' })

    // The server survived the malformed message: a legitimate one right after
    // still gets a normal answer instead of silence.
    phone.socket.emit(CHANNEL, { type: 'hello', protocolVersion: PROTOCOL_VERSION, code: 'ZZZZ' })
    const unknownTable = await waitFor(() =>
      phone.messages.filter((m) => m.type === 'error').find((m) => m.type === 'error' && m.code === 'unknown-table'),
    )
    expect(unknownTable).toEqual({ type: 'error', code: 'unknown-table' })
  })
})

describe('the negotiated transport', () => {
  it('is reported for every connection, so the log can answer the smoke test', async () => {
    const screen = connect()
    await waitForConnect(screen.socket)

    await waitFor(() => negotiations.length > 0)

    const first = negotiations[0]!
    expect(first.connectionId).toBe(screen.socket.id)
    expect(['polling', 'websocket']).toContain(first.transport)
    expect(first.upgraded).toBe(false)
  })

  it('reports an upgrade separately from the handshake', async () => {
    const screen = connect()
    await waitForConnect(screen.socket)

    // Socket.IO opens on polling by default and upgrades; either the handshake
    // was already websocket, or an upgrade follows. Both are legitimate — the
    // point is that whichever happened is written down.
    await waitFor(
      () => negotiations.some((n) => n.transport === 'websocket'),
    ).catch(() => undefined)

    for (const negotiation of negotiations) {
      expect(negotiation.connectionId).toBe(screen.socket.id)
    }
    expect(negotiations.filter((n) => !n.upgraded)).toHaveLength(1)
  })
})
