import type { Server as HttpServer } from 'node:http'
import type { ServerToClient } from '@m8/protocol'
import type { Connection, Transport } from '@m8/transport'
import { Server as SocketServer, type Socket } from 'socket.io'

const CHANNEL = 'm8'

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

  constructor(
    httpServer: HttpServer,
    onNegotiation: (negotiation: TransportNegotiation) => void = () => {},
  ) {
    this.#io = new SocketServer(httpServer, { serveClient: false })
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
      socket.on(CHANNEL, (raw: unknown) => this.#onMessage(connection, raw))
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

  #wrap(socket: Socket): Connection {
    return {
      id: socket.id,
      send: (message: ServerToClient) => socket.emit(CHANNEL, message),
      close: () => socket.disconnect(true),
    }
  }
}
