/**
 * Bumped whenever the shape on the wire changes. A client whose version does
 * not match is told to reload, which turns "the server was updated while a
 * phone held a stale page" from a phantom bug into a clear message.
 */
export const PROTOCOL_VERSION = 1

export type ErrorCode =
  | 'unknown-table'
  | 'table-full'
  | 'invalid-code'
  | 'invalid-message'
  | 'not-allowed'
  /** No table could be opened at all: the server's code space is full. */
  | 'table-unavailable'

export interface ParticipantSnapshot {
  readonly id: string
  readonly nickname: string
  readonly avatarId: string
  readonly connected: boolean
  readonly hasBaton: boolean
}

/**
 * The complete table state. The server never sends diffs, so reconnecting is
 * receiving one of these like any other message.
 */
export interface TableSnapshot {
  readonly code: string
  readonly phase: 'awaiting-host' | 'choosing-game'
  readonly participants: readonly ParticipantSnapshot[]
}

export type ScreenToServer = {
  readonly type: 'helloTable'
  readonly protocolVersion: number
  /** A code stored locally by the screen, so a refresh rejoins the same table. */
  readonly code?: string
}

export type ClientToServer =
  | {
      readonly type: 'hello'
      readonly protocolVersion: number
      readonly code: string
      /** Persisted on the device; this is what makes "the same phone" answerable. */
      readonly token?: string
    }
  | {
      readonly type: 'setProfile'
      readonly nickname: string
      readonly avatarId: string
    }
  | { readonly type: 'leave' }

export type ServerToClient =
  | { readonly type: 'welcome'; readonly participantId: string; readonly token: string }
  | { readonly type: 'tableReady'; readonly code: string }
  | { readonly type: 'tableState'; readonly table: TableSnapshot }
  | { readonly type: 'error'; readonly code: ErrorCode }
  | { readonly type: 'reload'; readonly reason: 'protocol-version' }
