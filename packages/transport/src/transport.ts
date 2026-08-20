import type { ServerToClient } from '@m8/protocol'

/** One connected device. The platform never learns what carries it. */
export interface Connection {
  readonly id: string
  send(message: ServerToClient): void
  close(): void
}

/**
 * The single seam between the platform and the network.
 *
 * Socket.IO implements this in production; FakeTransport implements it in
 * tests, which is what lets the whole table lifecycle — including drops and
 * reconnections — be tested with no ports, no sleeps and no flakiness.
 */
export interface Transport {
  onConnect(handler: (connection: Connection) => void): void
  onMessage(handler: (connection: Connection, raw: unknown) => void): void
  onDisconnect(handler: (connection: Connection) => void): void
}
