import type { ServerToClient } from '@m8/protocol'
import type { Connection, Transport } from './transport.js'

interface Entry {
  readonly connection: Connection
  readonly sent: ServerToClient[]
  open: boolean
}

/**
 * An in-memory Transport with test controls. Nothing here is asynchronous, so
 * a test reads like the scene it describes and finishes in microseconds.
 */
export class FakeTransport implements Transport {
  readonly #entries = new Map<string, Entry>()
  #onConnect: (connection: Connection) => void = () => {}
  #onMessage: (connection: Connection, raw: unknown) => void = () => {}
  #onDisconnect: (connection: Connection) => void = () => {}

  onConnect(handler: (connection: Connection) => void): void {
    this.#onConnect = handler
  }

  onMessage(handler: (connection: Connection, raw: unknown) => void): void {
    this.#onMessage = handler
  }

  onDisconnect(handler: (connection: Connection) => void): void {
    this.#onDisconnect = handler
  }

  // --- test controls -------------------------------------------------------

  connect(id: string): Connection {
    const entry: Entry = {
      connection: {
        id,
        send: (message) => {
          if (entry.open) entry.sent.push(message)
        },
        // Mirrors the real adapter, where close() is socket.disconnect(true):
        // that makes Socket.IO emit its own disconnect event, so closing a
        // connection from the platform side must notify onDisconnect too.
        close: () => {
          this.#closeEntry(entry)
        },
      },
      sent: [],
      open: true,
    }
    this.#entries.set(id, entry)
    this.#onConnect(entry.connection)
    return entry.connection
  }

  receive(id: string, raw: unknown): void {
    this.#onMessage(this.#require(id).connection, raw)
  }

  disconnect(id: string): void {
    this.#closeEntry(this.#require(id))
  }

  sentTo(id: string): readonly ServerToClient[] {
    return this.#require(id).sent
  }

  isOpen(id: string): boolean {
    return this.#require(id).open
  }

  #closeEntry(entry: Entry): void {
    if (!entry.open) return
    entry.open = false
    this.#onDisconnect(entry.connection)
  }

  #require(id: string): Entry {
    const entry = this.#entries.get(id)
    if (!entry) throw new Error(`No such connection: ${id}`)
    return entry
  }
}
