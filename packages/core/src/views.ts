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

export interface TableView {
  readonly code: string
  readonly phase: TablePhase
  readonly participants: readonly ParticipantView[]
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
