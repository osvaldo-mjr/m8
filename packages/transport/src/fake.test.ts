import { describe, expect, it, vi } from 'vitest'
import { FakeTransport } from './fake.js'

describe('FakeTransport', () => {
  it('notifies the connect handler with the new connection', () => {
    const transport = new FakeTransport()
    const seen: string[] = []
    transport.onConnect((connection) => seen.push(connection.id))

    transport.connect('tv-1')

    expect(seen).toEqual(['tv-1'])
  })

  it('records what was sent to each connection', () => {
    const transport = new FakeTransport()
    const connection = transport.connect('phone-1')

    connection.send({ type: 'tableReady', code: 'KXTP' })

    expect(transport.sentTo('phone-1')).toEqual([{ type: 'tableReady', code: 'KXTP' }])
  })

  it('preserves send order in sentTo', () => {
    const transport = new FakeTransport()
    const connection = transport.connect('phone-1')

    connection.send({ type: 'tableReady', code: 'AAAA' })
    connection.send({ type: 'tableReady', code: 'BBBB' })
    connection.send({ type: 'tableReady', code: 'CCCC' })

    expect(transport.sentTo('phone-1')).toEqual([
      { type: 'tableReady', code: 'AAAA' },
      { type: 'tableReady', code: 'BBBB' },
      { type: 'tableReady', code: 'CCCC' },
    ])
  })

  it('keeps each connection inbox separate', () => {
    const transport = new FakeTransport()
    const a = transport.connect('a')
    transport.connect('b')

    a.send({ type: 'tableReady', code: 'KXTP' })

    expect(transport.sentTo('b')).toEqual([])
  })

  it('delivers inbound messages with their connection', () => {
    const transport = new FakeTransport()
    const handler = vi.fn()
    transport.onMessage(handler)
    const connection = transport.connect('phone-1')

    transport.receive('phone-1', { type: 'leave' })

    expect(handler).toHaveBeenCalledWith(connection, { type: 'leave' })
  })

  it('notifies the disconnect handler and marks the connection closed', () => {
    const transport = new FakeTransport()
    const handler = vi.fn()
    transport.onDisconnect(handler)
    transport.connect('phone-1')

    transport.disconnect('phone-1')

    expect(handler).toHaveBeenCalledOnce()
    expect(transport.isOpen('phone-1')).toBe(false)
  })

  it('marks the connection closed when the platform closes it', () => {
    const transport = new FakeTransport()
    const connection = transport.connect('phone-1')

    connection.close()

    expect(transport.isOpen('phone-1')).toBe(false)
  })

  it('fires the disconnect handler when the platform closes the connection', () => {
    const transport = new FakeTransport()
    const handler = vi.fn()
    transport.onDisconnect(handler)
    const connection = transport.connect('phone-1')

    connection.close()

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('fires the disconnect handler exactly once across a double close', () => {
    const transport = new FakeTransport()
    const handler = vi.fn()
    transport.onDisconnect(handler)
    const connection = transport.connect('phone-1')

    connection.close()
    connection.close()

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('fires the disconnect handler exactly once across close then disconnect', () => {
    const transport = new FakeTransport()
    const handler = vi.fn()
    transport.onDisconnect(handler)
    const connection = transport.connect('phone-1')

    connection.close()
    transport.disconnect('phone-1')

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('fires the disconnect handler exactly once across disconnect then close', () => {
    const transport = new FakeTransport()
    const handler = vi.fn()
    transport.onDisconnect(handler)
    const connection = transport.connect('phone-1')

    transport.disconnect('phone-1')
    connection.close()

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('silently drops sends to a closed connection', () => {
    const transport = new FakeTransport()
    const connection = transport.connect('phone-1')
    transport.disconnect('phone-1')

    connection.send({ type: 'tableReady', code: 'KXTP' })

    expect(transport.sentTo('phone-1')).toEqual([])
  })

  it('throws when a test drives an unknown connection', () => {
    const transport = new FakeTransport()
    expect(() => transport.receive('ghost', { type: 'leave' })).toThrow(/ghost/)
  })
})

describe('FakeTransport handler registration', () => {
  // The Transport contract is single-slot: registering again replaces the
  // previous handler rather than adding a second one. Pinned here because a
  // substitute implementation built on an EventEmitter would add instead,
  // and every message would then be handled twice.
  it('replaces the connect handler rather than adding a second one', () => {
    const transport = new FakeTransport()
    const first = vi.fn()
    const second = vi.fn()
    transport.onConnect(first)
    transport.onConnect(second)

    transport.connect('phone-1')

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('replaces the message handler rather than adding a second one', () => {
    const transport = new FakeTransport()
    const first = vi.fn()
    const second = vi.fn()
    transport.onMessage(first)
    transport.onMessage(second)
    transport.connect('phone-1')

    transport.receive('phone-1', { type: 'leave' })

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('replaces the disconnect handler rather than adding a second one', () => {
    const transport = new FakeTransport()
    const first = vi.fn()
    const second = vi.fn()
    transport.onDisconnect(first)
    transport.onDisconnect(second)
    transport.connect('phone-1')

    transport.disconnect('phone-1')

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })
})
