import { PROTOCOL_VERSION, type ServerToClient } from '@m8/protocol'
import { parseInbound } from '@m8/protocol/validate'
import type { Table, TableRegistry } from '@m8/core'
import type { Connection, Transport } from '@m8/transport'
import { CATALOGUE, findManifest } from './catalogue.js'
import { toError, type FaultReporter } from './faults.js'
import { clampPage, manifestPageCount, translateDevice, translateError, translateTable } from './translate.js'

interface Attachment {
  readonly role: 'screen' | 'phone'
  readonly code: string
  readonly participantId?: string
}

/**
 * Translates between the transport and the domain.
 *
 * The domain speaks TableView; the wire speaks ServerToClient and
 * TableSnapshot. This class is the only place that knows both, which is what
 * keeps packages/core free of any notion that a network exists. The
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
  readonly #onFault: FaultReporter

  constructor(transport: Transport, registry: TableRegistry, onFault: FaultReporter) {
    this.#transport = transport
    this.#registry = registry
    this.#onFault = onFault

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
        const opened = this.#registry.openTable(message.code)
        if ('error' in opened) {
          // The code space is full. Nothing is attached and no code is
          // announced, so the screen is never left showing a table nobody
          // can join; it displays the error instead, which is the only
          // diagnostic surface a television has.
          connection.send({ type: 'error', code: translateError(opened.error) })
          return
        }
        const table = opened.table
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
        const result = this.#registry.joinParticipant(message.code, message.token, message.round)
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
        this.#broadcast(result.table)
        return
      }

      case 'setProfile': {
        const attachment = this.#attachments.get(connection.id)
        if (!attachment || attachment.role !== 'phone' || attachment.participantId === undefined) {
          connection.send({ type: 'error', code: 'not-allowed' })
          return
        }
        this.#registry.setProfile(
          attachment.code,
          attachment.participantId,
          message.nickname,
          message.avatarId,
        )
        this.#broadcastCode(attachment.code)
        return
      }

      case 'leave': {
        const attachment = this.#attachments.get(connection.id)
        if (!attachment || attachment.role !== 'phone' || attachment.participantId === undefined) return
        this.#releaseParticipant(attachment.participantId, connection.id)
        this.#registry.removeParticipant(attachment.code, attachment.participantId)
        this.#attachments.delete(connection.id)
        this.#broadcastCode(attachment.code)
        return
      }

      case 'previewGame': {
        const attachment = this.#phoneAttachment(connection)
        if (!attachment) return

        const result = this.#registry.previewGame(attachment.code, attachment.participantId, message.gameId)
        if (result) {
          connection.send({ type: 'error', code: translateError(result.error) })
          return
        }
        this.#broadcastCode(attachment.code)
        return
      }

      case 'manualPage': {
        const attachment = this.#phoneAttachment(connection)
        if (!attachment) return

        // The manifest of whatever is currently on preview, not of the
        // message: `manualPage` carries only a page number, so how many
        // pages exist is read from the table's own preview, not from the
        // request.
        const table = this.#registry.getTable(attachment.code)
        const manifest = table?.preview ? findManifest(table.preview.gameId) : undefined
        if (!manifest) {
          connection.send({ type: 'error', code: 'not-allowed' })
          return
        }

        const page = clampPage(message.page, manifestPageCount(manifest))
        const result = this.#registry.setPreviewPage(attachment.code, attachment.participantId, page)
        if (result) {
          connection.send({ type: 'error', code: translateError(result.error) })
          return
        }
        this.#broadcastCode(attachment.code)
        return
      }

      case 'chooseGame': {
        const attachment = this.#phoneAttachment(connection)
        if (!attachment) return

        // A gameId naming nothing in the catalogue is refused here and the
        // table is left untouched — the same reasoning `previewGame` and
        // `translatePreview` apply the other way around, except a choice,
        // unlike a preview, commits real seats and must not commit them to
        // a game that does not exist.
        const manifest = findManifest(message.gameId)
        if (!manifest) {
          connection.send({ type: 'error', code: 'not-allowed' })
          return
        }

        // A manifest that resolves but is not yet playable is refused the
        // same way: the catalogue lists a coming-soon game and the phone may
        // preview it (`previewGame` carries no such gate), but committing
        // seats to a game with no rules to start would leave the table stuck
        // in `seating` forever. This is the rule "three of the four games
        // are not playable" is meant to enforce — enforcing it only on the
        // phone's own `canChooseGame` check would make it a UI convention
        // rather than a guarantee the domain construction provides.
        if (manifest.status !== 'playable') {
          connection.send({ type: 'error', code: 'not-allowed' })
          return
        }

        const result = this.#registry.chooseGame(
          attachment.code,
          attachment.participantId,
          message.gameId,
          manifest.seats,
        )
        if (result) {
          connection.send({ type: 'error', code: translateError(result.error) })
          return
        }
        this.#broadcastCode(attachment.code)
        return
      }

      case 'setHostPlaying': {
        const attachment = this.#phoneAttachment(connection)
        if (!attachment) return

        const result = this.#registry.setHostPlaying(attachment.code, attachment.participantId, message.playing)
        if (result) {
          connection.send({ type: 'error', code: translateError(result.error) })
          return
        }
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
    this.#registry.disconnectParticipant(attachment.code, attachment.participantId)
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
   * The phone attachment for `connection`, already sending the refusal and
   * returning `undefined` when there isn't one. Every catalogue-and-seats
   * message needs exactly the guard `setProfile` and `leave` already apply
   * inline, so it is named once here rather than repeated at each call site.
   */
  #phoneAttachment(
    connection: Connection,
  ): { readonly code: string; readonly participantId: string } | undefined {
    const attachment = this.#attachments.get(connection.id)
    if (!attachment || attachment.role !== 'phone' || attachment.participantId === undefined) {
      connection.send({ type: 'error', code: 'not-allowed' })
      return undefined
    }
    return { code: attachment.code, participantId: attachment.participantId }
  }

  #broadcastCode(code: string): void {
    const table = this.#registry.getTable(code)
    if (table) this.#broadcast(table)
  }

  /**
   * The screen attachment for a table receives the table, translated once
   * and shared; every phone attachment receives its own `DeviceView`,
   * translated and sent to nobody else. There is no code path in which a
   * phone's branch ever touches `tableMessage` — the guarantee that a phone
   * never receives the table holds by construction, not by discipline.
   */
  #broadcast(table: Table): void {
    const tableView = this.#registry.snapshot(table)
    const tableMessage: ServerToClient = { type: 'tableState', table: translateTable(tableView, CATALOGUE) }

    for (const [connectionId, attachment] of this.#attachments) {
      if (attachment.code !== table.code) continue
      const connection = this.#connections.get(connectionId)
      if (!connection) continue

      if (attachment.role === 'screen') {
        this.#deliver(connection, tableMessage)
        continue
      }

      if (attachment.participantId === undefined) continue
      const deviceView = this.#registry.deviceView(table, attachment.participantId)
      this.#deliver(connection, { type: 'deviceState', device: translateDevice(deviceView) })
    }
  }

  /**
   * One recipient's delivery, guarded so the rest of the broadcast still
   * happens. A send that throws part-way through the loop would otherwise
   * leave every device after it holding state from before the change, with no
   * further message coming — the server believes it already sent one. The
   * television is usually first in that loop, which is the worst version of
   * it: the room's shared source of truth stops moving while the table does
   * not.
   *
   * Deliberately around the send alone. The projection for each recipient is
   * built by the caller, outside this, so a domain bug there still surfaces as
   * a red test instead of being swallowed once per device. And deliberately
   * not silent: this is the only trace that one device in the room stopped
   * being told anything.
   */
  #deliver(connection: Connection, message: ServerToClient): void {
    try {
      connection.send(message)
    } catch (thrown) {
      this.#onFault({
        connectionId: connection.id,
        stage: 'sending',
        messageType: message.type,
        error: toError(thrown),
      })
    }
  }
}
