import { PROTOCOL_VERSION, type ServerToClient } from '@m8/protocol'
import { parseInbound } from '@m8/protocol/validate'
import type { DomainEvent, Table, TableRegistry } from '@m8/core'
import type { Connection, Transport } from '@m8/transport'
import { translateError, translateTable } from './translate.js'

interface Attachment {
  readonly role: 'screen' | 'phone'
  readonly code: string
  readonly participantId?: string
}

/**
 * Translates between the transport and the domain.
 *
 * The domain speaks DomainEvent and TableView; the wire speaks ServerToClient
 * and TableSnapshot. This class is the only place that knows both, which is
 * what keeps packages/core free of any notion that a network exists. The
 * field-by-field conversion between the two vocabularies itself lives in
 * translate.ts, kept separate so it can be tested and read on its own.
 */
export class Session {
  readonly #transport: Transport
  readonly #registry: TableRegistry
  readonly #attachments = new Map<string, Attachment>()
  readonly #connections = new Map<string, Connection>()

  constructor(transport: Transport, registry: TableRegistry) {
    this.#transport = transport
    this.#registry = registry

    this.#transport.onConnect((connection) => {
      this.#connections.set(connection.id, connection)
    })

    this.#transport.onMessage((connection, raw) => {
      this.#handle(connection, raw)
    })

    this.#transport.onDisconnect((connection) => {
      this.#handleDisconnect(connection)
    })
  }

  #handle(connection: Connection, raw: unknown): void {
    const message = parseInbound(raw)
    if (message === null) {
      connection.send({ type: 'error', code: 'invalid-message' })
      return
    }

    switch (message.type) {
      case 'helloTable': {
        if (message.protocolVersion !== PROTOCOL_VERSION) {
          connection.send({ type: 'reload', reason: 'protocol-version' })
          return
        }
        const existing = message.code === undefined ? undefined : this.#registry.getTable(message.code)
        const table = existing ?? this.#registry.createTable()
        this.#attachments.set(connection.id, { role: 'screen', code: table.code })
        connection.send({ type: 'tableReady', code: table.code })
        this.#broadcast(table)
        return
      }

      case 'hello': {
        if (message.protocolVersion !== PROTOCOL_VERSION) {
          connection.send({ type: 'reload', reason: 'protocol-version' })
          return
        }
        const result = this.#registry.joinParticipant(message.code, message.token)
        if ('error' in result) {
          connection.send({ type: 'error', code: translateError(result.error) })
          return
        }
        this.#attachments.set(connection.id, {
          role: 'phone',
          code: result.table.code,
          participantId: result.participant.id,
        })
        connection.send({
          type: 'welcome',
          participantId: result.participant.id,
          token: result.participant.token,
        })
        this.#applyEvents(result.events)
        this.#broadcast(result.table)
        return
      }

      case 'setProfile': {
        const attachment = this.#attachments.get(connection.id)
        if (!attachment || attachment.participantId === undefined) {
          connection.send({ type: 'error', code: 'not-allowed' })
          return
        }
        const events = this.#registry.setProfile(
          attachment.code,
          attachment.participantId,
          message.nickname,
          message.avatarId,
        )
        this.#applyEvents(events)
        this.#broadcastCode(attachment.code)
        return
      }

      case 'leave': {
        const attachment = this.#attachments.get(connection.id)
        if (!attachment || attachment.participantId === undefined) return
        const events = this.#registry.removeParticipant(attachment.code, attachment.participantId)
        this.#attachments.delete(connection.id)
        this.#applyEvents(events)
        this.#broadcastCode(attachment.code)
        return
      }
    }
  }

  #handleDisconnect(connection: Connection): void {
    const attachment = this.#attachments.get(connection.id)
    this.#attachments.delete(connection.id)
    this.#connections.delete(connection.id)
    if (!attachment || attachment.participantId === undefined) return

    const events = this.#registry.disconnectParticipant(attachment.code, attachment.participantId)
    this.#applyEvents(events)
    this.#broadcastCode(attachment.code)
  }

  /**
   * Reserved for events that need a message of their own. Today every event is
   * already reflected in the snapshot that follows it, because the server
   * sends full state rather than diffs.
   */
  #applyEvents(_events: readonly DomainEvent[]): void {}

  #broadcastCode(code: string): void {
    const table = this.#registry.getTable(code)
    if (table) this.#broadcast(table)
  }

  #broadcast(table: Table): void {
    const view = this.#registry.snapshot(table)
    const message: ServerToClient = { type: 'tableState', table: translateTable(view) }

    for (const [connectionId, attachment] of this.#attachments) {
      if (attachment.code !== table.code) continue
      this.#connections.get(connectionId)?.send(message)
    }
  }
}
