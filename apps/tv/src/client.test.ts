import { PROTOCOL_VERSION, type ServerToClient } from '@m8/protocol'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { connectScreen, determineHelloMessage } from './client.js'

/**
 * A stub socket standing in for socket.io-client, and stubs for the two
 * browser surfaces this module touches — storage and a page reload. Stated
 * explicitly rather than summoned by loading a whole DOM implementation:
 * this says what the dependency actually is, and Node's own experimental
 * `localStorage` global shadows the one a DOM environment would provide.
 *
 * `connectScreen` deliberately returns nothing — the large screen has exactly
 * one outbound message and no handle a second one could be grown onto — so
 * there is no `disconnect()` to exercise here, unlike the phone client. What
 * it does have is a greeting, a remembered code and a reload path, and none
 * of those were covered at all before.
 */
interface StubSocket {
  emitted: { event: string; payload: unknown }[]
  fire(event: string, payload?: unknown): void
}

const stub = vi.hoisted(() => ({ current: null as StubSocket | null }))

vi.mock('socket.io-client', () => ({
  io: () => stub.current,
}))

function makeStubSocket(): StubSocket {
  const handlers = new Map<string, (payload: unknown) => void>()
  const socket = {
    emitted: [] as { event: string; payload: unknown }[],
    on(event: string, handler: (payload: unknown) => void) {
      handlers.set(event, handler)
    },
    emit(event: string, payload: unknown) {
      socket.emitted.push({ event, payload })
    },
    disconnect() {},
    fire(event: string, payload?: unknown) {
      const handler = handlers.get(event)
      if (!handler) throw new Error(`Nothing listening for ${event}`)
      handler(payload)
    },
  }
  return socket
}

function makeStorageStub(): Storage {
  const entries = new Map<string, string>()
  return {
    get length() {
      return entries.size
    },
    clear: () => entries.clear(),
    getItem: (key: string) => entries.get(key) ?? null,
    key: (index: number) => [...entries.keys()][index] ?? null,
    removeItem: (key: string) => entries.delete(key) as unknown as void,
    setItem: (key: string, value: string) => entries.set(key, value) as unknown as void,
  }
}

let storage: Storage

beforeEach(() => {
  storage = makeStorageStub()
  vi.stubGlobal('window', { localStorage: storage, location: { reload: vi.fn() } })
  stub.current = makeStubSocket()
})

function socket(): StubSocket {
  if (stub.current === null) throw new Error('No stub socket')
  return stub.current
}

describe('determineHelloMessage', () => {
  it('greets without a code when nothing was stored', () => {
    expect(determineHelloMessage(null)).toEqual({
      type: 'helloTable',
      protocolVersion: PROTOCOL_VERSION,
    })
  })

  it('rejoins the stored table when a code was stored', () => {
    expect(determineHelloMessage('KXTP')).toEqual({
      type: 'helloTable',
      protocolVersion: PROTOCOL_VERSION,
      code: 'KXTP',
    })
  })
})

describe('connectScreen', () => {
  const state: ServerToClient = {
    type: 'tableState',
    table: { code: 'KXTP', phase: 'awaiting-host', participants: [] },
  }

  it('greets on connect, asking for a fresh table when none is remembered', () => {
    connectScreen(vi.fn())

    socket().fire('connect')

    expect(socket().emitted).toEqual([
      { event: 'm8', payload: { type: 'helloTable', protocolVersion: PROTOCOL_VERSION } },
    ])
  })

  it('asks for the remembered table when the screen has one', () => {
    connectScreen(vi.fn())
    socket().fire('m8', { type: 'tableReady', code: 'KXTP' })

    // A television that reloads, or reconnects after the network blinked,
    // must come back to the same table rather than opening a new one.
    socket().fire('connect')

    expect(socket().emitted).toEqual([
      {
        event: 'm8',
        payload: { type: 'helloTable', protocolVersion: PROTOCOL_VERSION, code: 'KXTP' },
      },
    ])
  })

  it('greets again on every connect, since a reconnect is a fresh connection', () => {
    connectScreen(vi.fn())

    socket().fire('connect')
    socket().fire('connect')

    expect(socket().emitted).toHaveLength(2)
  })

  it('delivers a message to the handler', () => {
    const onMessage = vi.fn()
    connectScreen(onMessage)

    socket().fire('m8', state)

    expect(onMessage).toHaveBeenCalledWith(state)
  })

  it('delivers tableReady to the handler as well as remembering it', () => {
    const onMessage = vi.fn()
    connectScreen(onMessage)

    socket().fire('m8', { type: 'tableReady', code: 'KXTP' })

    expect(onMessage).toHaveBeenCalledWith({ type: 'tableReady', code: 'KXTP' })
  })

  it('reloads the page on a reload message instead of handing it to the caller', () => {
    const onMessage = vi.fn()
    connectScreen(onMessage)

    socket().fire('m8', { type: 'reload', reason: 'protocol-version' })

    expect(window.location.reload).toHaveBeenCalledTimes(1)
    expect(onMessage).not.toHaveBeenCalled()
  })
})
