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
  /**
   * The connection currently entitled to speak for a participant. A rejoin
   * on a fresh socket (a phone that reloaded) takes ownership immediately;
   * the superseded connection's attachment is evicted at that moment, so
   * when its own disconnect eventually arrives - anywhere up to Socket.IO's
   * ping timeout later - there is no attachment left for it to act on.
   * Without this, a stale socket's late disconnect marks a live, reconnected
   * participant offline.
   */
  readonly #participantOwners = new Map<string, string>()

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
        // The TV only displays: a connection already speaking for a phone
        // must not also become a screen.
        const attachment = this.#attachments.get(connection.id)
        if (attachment && attachment.role === 'phone') {
          connection.send({ type: 'error', code: 'not-allowed' })
          return
        }

        if (message.protocolVersion !== PROTOCOL_VERSION) {
          connection.send({ type: 'reload', reason: 'protocol-version' })
          return
        }
        const table = this.#registry.openTable(message.code)
        this.#attachments.set(connection.id, { role: 'screen', code: table.code })
        connection.send({ type: 'tableReady', code: table.code })
        this.#broadcast(table)
        return
      }

      case 'hello': {
        // One connection carries one identity for its whole life: a screen
        // never joins as a participant, and a connection already speaking for
        // a participant never mints a second one. Answering `not-allowed` is
        // chosen over releasing the previous participant because releasing
        // would make `hello` destructive of a seat nobody asked to give up,
        // while rejecting costs a legitimate client nothing: the phone greets
        // once per connection, and Socket.IO hands a reconnection a fresh
        // connection with a fresh id.
        const existing = this.#attachments.get(connection.id)
        if (existing) {
          connection.send({ type: 'error', code: 'not-allowed' })
          return
        }

        if (message.protocolVersion !== PROTOCOL_VERSION) {
          connection.send({ type: 'reload', reason: 'protocol-version' })
          return
        }
        const result = this.#registry.joinParticipant(message.code, message.token)
        if ('error' in result) {
          connection.send({ type: 'error', code: translateError(result.error) })
          return
        }

        this.#claimParticipant(result.participant.id, connection.id)
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
        if (!attachment || attachment.role !== 'phone' || attachment.participantId === undefined) {
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
        if (!attachment || attachment.role !== 'phone' || attachment.participantId === undefined) return
        this.#releaseParticipant(attachment.participantId, connection.id)
        const events = this.#registry.removeParticipant(attachment.code, attachment.participantId)
        this.#attachments.delete(connection.id)
        this.#applyEvents(events)
        this.#broadcastCode(attachment.code)
        return
      }

      default: {
        // Exhaustiveness guard: parseInbound only ever returns one of the
        // cases above today, but if ClientToServer or ScreenToServer grows a
        // member without a matching case here, this line fails to typecheck
        // instead of leaving a client waiting on a message nobody answers.
        const unreachable: never = message
        connection.send({ type: 'error', code: 'invalid-message' })
        return unreachable
      }
    }
  }

  #handleDisconnect(connection: Connection): void {
    const attachment = this.#attachments.get(connection.id)
    this.#attachments.delete(connection.id)
    this.#connections.delete(connection.id)
    if (!attachment || attachment.participantId === undefined) return

    // If a newer connection has already claimed this participant (a
    // reconnect happened before this - possibly very late - disconnect
    // arrived), this connection no longer speaks for anyone and must not
    // mark the participant offline.
    if (this.#participantOwners.get(attachment.participantId) !== connection.id) return

    this.#participantOwners.delete(attachment.participantId)
    const events = this.#registry.disconnectParticipant(attachment.code, attachment.participantId)
    this.#applyEvents(events)
    this.#broadcastCode(attachment.code)
  }

  /**
   * Records that `connectionId` now speaks for `participantId`, evicting
   * whatever connection held that claim before - its attachment is removed
   * so a disconnect arriving from it later is a no-op.
   */
  #claimParticipant(participantId: string, connectionId: string): void {
    const previousOwner = this.#participantOwners.get(participantId)
    if (previousOwner !== undefined && previousOwner !== connectionId) {
      this.#attachments.delete(previousOwner)
    }
    this.#participantOwners.set(participantId, connectionId)
  }

  #releaseParticipant(participantId: string, connectionId: string): void {
    if (this.#participantOwners.get(participantId) === connectionId) {
      this.#participantOwners.delete(participantId)
    }
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
