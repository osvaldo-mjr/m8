import type { Server as HttpServer } from 'node:http'
import type { ServerToClient } from '@m8/protocol'
import type { Connection, Transport } from '@m8/transport'
import { Server as SocketServer, type Socket } from 'socket.io'
import { messageTypeOf, toError, type FaultReporter } from './faults.js'

const CHANNEL = 'm8'

/**
 * How long the server may take to notice a device that vanished without
 * closing its socket — a phone going into aeroplane mode, losing battery, or
 * being carried out of range. A clean tab close is detected immediately; only
 * a silent disappearance needs the heartbeat.
 *
 * Socket.IO defaults to 25s between pings and 20s of grace, so a silent
 * departure takes up to 45 seconds to register. In a living room that is far
 * too long: the screen would keep showing someone who left, and the seat
 * would not free until the reconnection window on top of that.
 *
 * The design is to notice quickly and forgive slowly — the screen says
 * `Reconnecting` within seconds, while the seat is held far longer. A phone
 * whose Wi-Fi flickers is therefore only ever labelled, never evicted, so the
 * cost of noticing too eagerly is a word on a screen.
 */
export const HEARTBEAT = {
  pingInterval: 5_000,
  pingTimeout: 5_000,
} as const

/**
 * Which transport a device actually negotiated, and whether it later upgraded.
 *
 * This exists because the television smoke test tells the operator to read the
 * server log to find out whether Socket.IO fell back to long polling, calling
 * that the most diagnostic fact available — and until this callback existed the
 * server never wrote it down. Socket.IO handles its own requests on the bare
 * http server, before Fastify's router, so Fastify's request log never sees
 * them.
 */
export interface TransportNegotiation {
  readonly connectionId: string
  /** `'websocket'` or `'polling'`. */
  readonly transport: string
  /** False on the initial handshake, true when polling later upgraded. */
  readonly upgraded: boolean
}

/**
 * Both callbacks are required rather than defaulted: an adapter constructed
 * without a fault reporter is one whose failures go nowhere, which is the exact
 * shape of the defect this pair exists to close. A test that genuinely does not
 * care passes `() => {}` and says so.
 */
export interface SocketIoTransportOptions {
  readonly onNegotiation: (negotiation: TransportNegotiation) => void
  readonly onFault: FaultReporter
}

/**
 * The only file in the repository that knows Socket.IO exists. It owns the
 * `socket.io` Server too — constructed here from the bare `http.Server`,
 * rather than handed in already built — so that nothing else, not `app.ts`
 * and not a test, ever needs to import the package itself.
 *
 * Socket.IO was chosen for its automatic fall back to long polling: the target
 * is a television browser whose devtools cannot be opened, where a WebSocket
 * that silently fails would present as a black screen with no way to diagnose
 * it.
 */
export class SocketIoTransport implements Transport {
  readonly #io: SocketServer
  #onConnect: (connection: Connection) => void = () => {}
  #onMessage: (connection: Connection, raw: unknown) => void = () => {}
  #onDisconnect: (connection: Connection) => void = () => {}

  readonly #onFault: FaultReporter

  constructor(httpServer: HttpServer, options: SocketIoTransportOptions) {
    const { onNegotiation, onFault } = options
    this.#onFault = onFault
    this.#io = new SocketServer(httpServer, {
      serveClient: false,
      pingInterval: HEARTBEAT.pingInterval,
      pingTimeout: HEARTBEAT.pingTimeout,
    })
    this.#io.on('connection', (socket: Socket) => {
      onNegotiation({
        connectionId: socket.id,
        transport: socket.conn.transport.name,
        upgraded: false,
      })
      socket.conn.on('upgrade', () => {
        onNegotiation({
          connectionId: socket.id,
          transport: socket.conn.transport.name,
          upgraded: true,
        })
      })

      const connection = this.#wrap(socket)
      this.#onConnect(connection)
      socket.on(CHANNEL, (raw: unknown) => this.#deliver(connection, raw))
      socket.on('disconnect', () => this.#onDisconnect(connection))
    })
  }

  onConnect(handler: (connection: Connection) => void): void {
    this.#onConnect = handler
  }

  onMessage(handler: (connection: Connection, raw: unknown) => void): void {
    this.#onMessage = handler
  }

  onDisconnect(handler: (connection: Connection) => void): void {
    this.#onDisconnect = handler
  }

  /**
   * Not part of `Transport` — shutdown is a lifecycle concern the owner (the
   * Fastify app, or a test) drives directly, not something the domain-facing
   * seam needs to know about.
   */
  async close(): Promise<void> {
    await this.#io.close()
  }

  /**
   * The one boundary between "a table broke" and "the server died".
   *
   * A synchronous throw inside this listener is not contained by Socket.IO.
   * It is caught by `Client#ondata`, routed to `Client#onerror` and re-emitted
   * as the socket's `'error'` event; nothing registers a listener for that, so
   * Node's `EventEmitter` rethrows it from inside that same catch block, where
   * nothing can catch it again. No `process.on('uncaughtException')` exists in
   * this app, so the process goes down — taking every other table on the
   * instance and all of their state with it, because in-memory state is all
   * the state there is. One malformed message from one phone in one living
   * room would end every other session on the server. Verified empirically
   * against the installed `socket.io`, not reasoned about.
   *
   * The catch belongs here, in the one file that knows Socket.IO exists
   * (invariant 9), and nowhere above it: `packages/transport`'s fake drives
   * the whole test suite, so a catch on the domain side would make every
   * `expect(...).not.toThrow()` in it vacuous and stop domain bugs surfacing
   * as red tests.
   *
   * Never silent. By the time a translation throws, the domain mutation has
   * usually already landed: the table's real state has moved while every
   * device still holds the state from before it, and no further message is
   * coming. So the fault is reported with its stack for whoever reads the log,
   * and the one device whose message it was is told the message did not land.
   * Only that device — the others are not party to it, and their own state is
   * repaired by the next broadcast either way.
   */
  #deliver(connection: Connection, raw: unknown): void {
    try {
      this.#onMessage(connection, raw)
    } catch (thrown) {
      this.#onFault({
        connectionId: connection.id,
        stage: 'handling',
        messageType: messageTypeOf(raw),
        error: toError(thrown),
      })
      connection.send({ type: 'error', code: 'invalid-message' })
    }
  }

  #wrap(socket: Socket): Connection {
    return {
      id: socket.id,
      send: (message: ServerToClient) => socket.emit(CHANNEL, message),
      close: () => socket.disconnect(true),
    }
  }
}
