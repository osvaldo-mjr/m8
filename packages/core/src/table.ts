import type { Seat } from './seats.js'

export type TablePhase =
  | 'awaiting-host'
  | 'choosing-game'
  | 'seating'
  | 'playing'
  | 'paused'
  | 'awaiting-seat'
  | 'finished'

/**
 * The public shape of a participant. The registry keeps its own mutable
 * shape for its writes; everyone else gets this, so state nobody saw a
 * `DomainEvent` for is state nobody outside the registry can change either.
 */
export interface Participant {
  readonly id: string
  /** Persisted on the device. This, not the connection, is the identity. */
  readonly token: string
  readonly nickname: string
  readonly avatarId: string
  readonly connected: boolean
  readonly joinedAt: number
}

export interface Table {
  readonly code: string
  readonly phase: TablePhase
  readonly participants: readonly Participant[]
  /** The participant holding control of the session. Transferable. */
  readonly batonHolderId: string | null
  readonly createdAt: number
  /**
   * Bumped whenever the table clears its seats. Handed to a phone as part of
   * its session so a stale reconnection — a page left open in a pocket — can
   * be told apart from someone scanning the code afresh. See
   * `TableRegistry.joinParticipant`.
   */
  readonly round: number
  readonly chosenGameId: string | null
  readonly preview: { readonly gameId: string; readonly page: number } | null
  /** Empty until a game is chosen — seats come from a game's manifest, so
   * before a choice there is nothing to size them by. */
  readonly seats: readonly Seat[]
}
