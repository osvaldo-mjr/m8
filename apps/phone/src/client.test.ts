import { PROTOCOL_VERSION, type ServerToClient } from '@m8/protocol'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  codeFromLocation,
  connectPhone,
  determineHelloMessage,
  determineTokenToStore,
  tokenStorageKey,
} from './client.js'

/**
 * A stub socket standing in for socket.io-client. `connectPhone` had no test
 * at all, and it is where both of this branch's fatal bugs lived next door
 * to: everything it does — greeting, persisting a token, and refusing to
 * deliver anything after `disconnect()` — happens inside handlers that only
 * a fake socket can fire.
 */
interface StubSocket {
  emitted: { event: string; payload: unknown }[]
  disconnected: number
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
    disconnected: 0,
    on(event: string, handler: (payload: unknown) => void) {
      handlers.set(event, handler)
    },
    emit(event: string, payload: unknown) {
      socket.emitted.push({ event, payload })
    },
    disconnect() {
      socket.disconnected += 1
    },
    fire(event: string, payload?: unknown) {
      const handler = handlers.get(event)
      if (!handler) throw new Error(`Nothing listening for ${event}`)
      handler(payload)
    },
  }
  return socket
}

/**
 * The browser surfaces this module touches — storage and a page reload —
 * stubbed explicitly rather than summoned by loading a whole DOM
 * implementation. A stub says what the dependency actually is instead of
 * hiding it inside an environment, and Node's own experimental `localStorage`
 * global shadows the one a DOM environment would provide anyway.
 */
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

describe('codeFromLocation', () => {
  it('reads the code from the root path', () => {
    expect(codeFromLocation('/KXTP')).toBe('KXTP')
  })

  it('uppercases a lowercase code', () => {
    expect(codeFromLocation('/kxtp')).toBe('KXTP')
  })

  it('tolerates a trailing slash', () => {
    expect(codeFromLocation('/KXTP/')).toBe('KXTP')
  })

  it('returns null for the bare root', () => {
    expect(codeFromLocation('/')).toBeNull()
  })

  it('returns null for a path with more than one segment', () => {
    expect(codeFromLocation('/assets/main.js')).toBeNull()
  })

  it('hands a code the server may reject to the server, rather than judging it', () => {
    // `0` is not in the code alphabet — but that alphabet lives in the
    // domain, and a second copy here is how a phone comes to reject codes
    // the server considers perfectly valid. The server is authoritative and
    // answers `invalid-code` itself.
    expect(codeFromLocation('/KXT0')).toBe('KXT0')
  })
})

describe('tokenStorageKey', () => {
  it('gives each table its own key', () => {
    expect(tokenStorageKey('KXTP')).not.toBe(tokenStorageKey('MNBV'))
  })

  it('names the table it belongs to', () => {
    expect(tokenStorageKey('KXTP')).toContain('KXTP')
  })
})

describe('determineHelloMessage', () => {
  it('greets without a token when none was stored', () => {
    expect(determineHelloMessage('KXTP', null)).toEqual({
      type: 'hello',
      protocolVersion: PROTOCOL_VERSION,
      code: 'KXTP',
    })
  })

  it('rejoins with the stored token when one was stored', () => {
    expect(determineHelloMessage('KXTP', 'stored-token')).toEqual({
      type: 'hello',
      protocolVersion: PROTOCOL_VERSION,
      code: 'KXTP',
      token: 'stored-token',
    })
  })
})

describe('determineTokenToStore', () => {
  it('reads the token off a welcome message', () => {
    expect(determineTokenToStore({ type: 'welcome', participantId: 'p1', token: 'abc' })).toBe('abc')
  })

  it('leaves a table state message with nothing to store', () => {
    expect(
      determineTokenToStore({
        type: 'tableState',
        table: {
          code: 'KXTP',
          phase: 'awaiting-host',
          participants: [],
          seats: [],
          qrVisible: true,
          preview: null,
        },
      }),
    ).toBeNull()
  })

  it('leaves an error message with nothing to store', () => {
    expect(determineTokenToStore({ type: 'error', code: 'unknown-table' })).toBeNull()
  })

  it('leaves a reload message with nothing to store', () => {
    expect(determineTokenToStore({ type: 'reload', reason: 'protocol-version' })).toBeNull()
  })

  it('leaves a tableReady message with nothing to store', () => {
    expect(determineTokenToStore({ type: 'tableReady', code: 'KXTP' })).toBeNull()
  })
})

describe('connectPhone', () => {
  const state: ServerToClient = {
    type: 'tableState',
    table: {
      code: 'KXTP',
      phase: 'awaiting-host',
      participants: [],
      seats: [],
      qrVisible: true,
      preview: null,
    },
  }

  it('greets the table on connect', () => {
    connectPhone('KXTP', vi.fn())

    socket().fire('connect')

    expect(socket().emitted).toEqual([
      { event: 'm8', payload: { type: 'hello', protocolVersion: PROTOCOL_VERSION, code: 'KXTP' } },
    ])
  })

  it('presents the token stored for that table', () => {
    storage.setItem(tokenStorageKey('KXTP'), 'token-for-a')
    connectPhone('KXTP', vi.fn())

    socket().fire('connect')

    expect(socket().emitted[0]?.payload).toEqual({
      type: 'hello',
      protocolVersion: PROTOCOL_VERSION,
      code: 'KXTP',
      token: 'token-for-a',
    })
  })

  it('does not present another table token as its own', () => {
    storage.setItem(tokenStorageKey('MNBV'), 'token-for-b')
    connectPhone('KXTP', vi.fn())

    socket().fire('connect')

    expect(socket().emitted[0]?.payload).toEqual({
      type: 'hello',
      protocolVersion: PROTOCOL_VERSION,
      code: 'KXTP',
    })
  })

  it('stores a welcome token under that table key, leaving another table alone', () => {
    storage.setItem(tokenStorageKey('MNBV'), 'token-for-b')
    connectPhone('KXTP', vi.fn())

    socket().fire('m8', { type: 'welcome', participantId: 'p1', token: 'token-for-a' })

    expect(storage.getItem(tokenStorageKey('KXTP'))).toBe('token-for-a')
    expect(storage.getItem(tokenStorageKey('MNBV'))).toBe('token-for-b')
  })

  it('delivers a message to the handler', () => {
    const onMessage = vi.fn()
    connectPhone('KXTP', onMessage)

    socket().fire('m8', state)

    expect(onMessage).toHaveBeenCalledWith(state)
  })

  it('sends what the caller asks it to send', () => {
    const client = connectPhone('KXTP', vi.fn())

    client.send({ type: 'setProfile', nickname: 'Ana', avatarId: 'fox' })

    expect(socket().emitted).toEqual([
      { event: 'm8', payload: { type: 'setProfile', nickname: 'Ana', avatarId: 'fox' } },
    ])
  })

  it('reloads the page on a reload message instead of handing it to the caller', () => {
    const onMessage = vi.fn()
    connectPhone('KXTP', onMessage)

    socket().fire('m8', { type: 'reload', reason: 'protocol-version' })

    expect(window.location.reload).toHaveBeenCalledTimes(1)
    expect(onMessage).not.toHaveBeenCalled()
  })

  it('closes the socket on disconnect', () => {
    const client = connectPhone('KXTP', vi.fn())

    client.disconnect()

    expect(socket().disconnected).toBe(1)
  })

  it('does not reach the handler with a message that arrives after disconnect', () => {
    const onMessage = vi.fn()
    const client = connectPhone('KXTP', onMessage)

    client.disconnect()
    socket().fire('m8', state)

    expect(onMessage).not.toHaveBeenCalled()
  })

  it('does not greet on a connect that arrives after disconnect', () => {
    const client = connectPhone('KXTP', vi.fn())

    client.disconnect()
    socket().fire('connect')

    expect(socket().emitted).toEqual([])
  })

  it('stores nothing from a message that arrives after disconnect', () => {
    const client = connectPhone('KXTP', vi.fn())

    client.disconnect()
    socket().fire('m8', { type: 'welcome', participantId: 'p1', token: 'late' })

    expect(storage.getItem(tokenStorageKey('KXTP'))).toBeNull()
  })
})
