import type { TablePhase } from './table.js'

/**
 * Core's own vocabulary for what it shows the outside world — deliberately
 * not the wire types from `@m8/protocol`. `apps/server` translates a
 * `TableView` into a `TableSnapshot` in a later task; core never imports the
 * wire vocabulary, so the domain and the protocol can change on separate
 * schedules and neither has to know the other exists.
 */
export interface ParticipantView {
  readonly id: string
  readonly nickname: string
  readonly avatarId: string
  readonly connected: boolean
  readonly hasBaton: boolean
}

/** A seat's own occupant, resolved to the participant sitting in it rather
 * than the bare id a `Seat` carries — the screen never has to look one up. */
export interface SeatView {
  readonly number: number
  readonly occupant: ParticipantView | null
}

export interface TableView {
  readonly code: string
  readonly phase: TablePhase
  readonly participants: readonly ParticipantView[]
  readonly seats: readonly SeatView[]
  readonly chosenGameId: string | null
  readonly preview: { readonly gameId: string; readonly page: number } | null
  /**
   * Whether the large screen should show the joining QR right now. Computed
   * once, on the server, from the phase and the free-seat count — the
   * television has no rule of its own to reimplement, which is what stops
   * the two screens from ever disagreeing about it.
   */
  readonly qrVisible: boolean
}

/**
 * What one phone is told: decisions, not data. There is no `code` and no
 * `participants` here — a phone holds nothing of the table's, so a field
 * that put the table back onto the device would be a regression this type
 * exists to catch.
 *
 * `canStart` and `playersNeeded` are computed here rather than left for the
 * device to derive from seat counts and a minimum, because a rule
 * reimplemented on the device is a rule that can drift from the server's.
 */
export interface DeviceView {
  readonly participantId: string
  readonly phase: TablePhase
  readonly seatNumber: number | null
  readonly hasBaton: boolean
  readonly canChooseGame: boolean
  readonly canStart: boolean
  readonly playersNeeded: number
}

/**
 * Core's own error vocabulary. `invalid-message` is a wire-framing concern
 * and has no domain meaning, so it does not appear here.
 *
 * `table-unavailable` is the refusal to mint a new table: the code space is
 * finite and nothing evicts a table yet, so a long-lived process can in
 * principle run out. It is a value rather than a thrown error because the
 * only caller is a socket event listener with nothing catching above it —
 * throwing there ends the process and every other table in it, while a
 * refusal reaches the one screen that asked.
 */
export type DomainError =
  | 'unknown-table'
  | 'invalid-code'
  | 'table-full'
  | 'not-allowed'
  | 'table-unavailable'
  | 'stale-round'
