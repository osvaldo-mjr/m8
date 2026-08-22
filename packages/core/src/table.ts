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
 * shape for its writes; everyone else gets this, so state outside the
 * registry can never be changed except through one of its methods.
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
   * Handed to a phone as part of its session so a stale reconnection — a page
   * left open in a pocket — can be told apart from someone scanning the code
   * afresh. A phone presenting a round the table has moved past is refused;
   * see `TableRegistry.joinParticipant`.
   *
   * Nothing advances it yet, and this milestone contains nothing that could:
   * it is meant to move when the table clears its seats, and the two actions
   * that do that — "Clear seats" and "Change game" — end a match, which needs
   * a match to end. Both arrive with Plan 3, and the bump arrives with them.
   * Emptying the table by everybody leaving is deliberately not one of them
   * (see `TableRegistry`'s own `#empty`): nobody can be holding a session for
   * a table they all walked away from.
   *
   * The refusal itself is real and tested; what is missing is a way for the
   * running application to provoke it, which is why the television checklist
   * records the round marker as not yet checkable.
   */
  readonly round: number
  readonly chosenGameId: string | null
  readonly preview: { readonly gameId: string; readonly page: number } | null
  /** Empty until a game is chosen — seats come from a game's manifest, so
   * before a choice there is nothing to size them by. */
  readonly seats: readonly Seat[]
  /**
   * The chosen game's minimum, from its manifest. A plain number rather than
   * the manifest itself — `packages/core` never imports `@m8/contract` — and
   * `null` until a game is chosen, the same moment `seats` stops being empty.
   */
  readonly seatsMin: number | null
}
