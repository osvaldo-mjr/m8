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
 *
 * **Registration is single-slot, not subscription.** Each `on…` method holds
 * exactly one handler: calling it again replaces the previous one, and there
 * is no way to unregister. This is part of the contract, not an accident of
 * either implementation — it is stated here because an implementation built
 * on an EventEmitter would naturally *add* a listener instead, and two live
 * handlers on a seam whose whole purpose is substitutability would mean every
 * message handled twice. The platform registers each handler once, at
 * construction, so the restriction costs it nothing.
 */
export interface Transport {
  /** Replaces any previously registered connect handler. */
  onConnect(handler: (connection: Connection) => void): void
  /** Replaces any previously registered message handler. */
  onMessage(handler: (connection: Connection, raw: unknown) => void): void
  /** Replaces any previously registered disconnect handler. */
  onDisconnect(handler: (connection: Connection) => void): void
}
