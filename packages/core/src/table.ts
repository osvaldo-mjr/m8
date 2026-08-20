export type TablePhase = 'awaiting-host' | 'choosing-game'

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
}
