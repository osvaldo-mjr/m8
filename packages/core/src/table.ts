export type TablePhase = 'awaiting-host' | 'choosing-game'

export interface Participant {
  readonly id: string
  /** Persisted on the device. This, not the connection, is the identity. */
  readonly token: string
  nickname: string
  avatarId: string
  connected: boolean
  readonly joinedAt: number
}

export interface Table {
  readonly code: string
  phase: TablePhase
  readonly participants: Participant[]
  /** The participant holding control of the session. Transferable. */
  batonHolderId: string | null
  readonly createdAt: number
}
