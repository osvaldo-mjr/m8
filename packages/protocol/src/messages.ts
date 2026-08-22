/**
 * Bumped whenever the shape on the wire changes. A client whose version does
 * not match is told to reload, which turns "the server was updated while a
 * phone held a stale page" from a phantom bug into a clear message.
 */
export const PROTOCOL_VERSION = 2

/**
 * How many characters of a nickname the server keeps. Part of the wire
 * contract, not a piece of the domain: it is what a client needs in order to
 * stop someone typing a name that will be silently truncated the moment it
 * arrives.
 *
 * The rule itself lives in `@m8/core`, which does the truncating and never
 * imports this package. This is a second copy on purpose — the phone must not
 * pull the domain into a browser bundle to read one number — and
 * `apps/server/src/limits.test.ts`, in the one place that sees both packages,
 * fails if the two ever disagree.
 */
export const NICKNAME_MAX_LENGTH = 16

export type ErrorCode =
  | 'unknown-table'
  | 'table-full'
  | 'invalid-code'
  | 'invalid-message'
  | 'not-allowed'
  /** No table could be opened at all: the server's code space is full. */
  | 'table-unavailable'
  /** The phone's session names a round the table has since moved past. */
  | 'stale-round'

/**
 * The wire's own copy of core's `TablePhase`, written out rather than
 * imported: `@m8/protocol` must not depend on `@m8/core`, so the phone can
 * read the wire vocabulary without pulling the domain into a browser bundle.
 * `apps/server/src/translate.ts` is the one place that sees both and is
 * where the two are proved to agree; `apps/server/src/limits.test.ts` fails
 * if they ever diverge.
 */
export type TablePhaseName =
  | 'awaiting-host'
  | 'choosing-game'
  | 'seating'
  | 'playing'
  | 'paused'
  | 'awaiting-seat'
  | 'finished'

/**
 * The wire's own copy of `@m8/contract`'s `Locale`, for the same reason
 * `TablePhaseName` is written out rather than imported: the protocol package
 * must not depend on the contract package. `apps/server/src/limits.test.ts`
 * fails if the two ever disagree.
 */
export type Locale = 'pt-BR' | 'en'

export interface ParticipantSnapshot {
  readonly id: string
  readonly nickname: string
  readonly avatarId: string
  readonly connected: boolean
  readonly hasBaton: boolean
}

export interface SeatSnapshot {
  readonly number: number
  readonly occupant: ParticipantSnapshot | null
}

/**
 * A manual page, already resolved from the manifest by the server. The
 * screen receives text rather than a page number because it cannot read a
 * manifest — only the server can, and only the server should.
 *
 * Both languages travel together. Which one the room reads is a decision
 * this plan does not make, and carrying both means making it later is a
 * change to one constant in the screen rather than a change to the wire.
 * One page is about sixty words, so the cost of carrying both is nothing.
 */
export interface PreviewSnapshot {
  readonly gameId: string
  readonly cover: string
  readonly name: Record<Locale, string>
  readonly page: number
  readonly pageCount: number
  readonly title: Record<Locale, string>
  readonly lines: Record<Locale, readonly string[]>
}

/**
 * The complete table state. The server never sends diffs, so reconnecting is
 * receiving one of these like any other message.
 */
export interface TableSnapshot {
  readonly code: string
  readonly phase: TablePhaseName
  readonly participants: readonly ParticipantSnapshot[]
  readonly seats: readonly SeatSnapshot[]
  readonly qrVisible: boolean
  readonly preview: PreviewSnapshot | null
}

/** What one phone is told. There is no table here, and no manual. */
export interface DeviceSnapshot {
  readonly participantId: string
  readonly phase: TablePhaseName
  readonly seatNumber: number | null
  readonly hasBaton: boolean
  readonly canChooseGame: boolean
  readonly canStart: boolean
  readonly playersNeeded: number
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
      /** The round this device's session names, if it has one. See `stale-round`. */
      readonly round?: number
    }
  | {
      readonly type: 'setProfile'
      readonly nickname: string
      readonly avatarId: string
    }
  | { readonly type: 'leave' }
  | { readonly type: 'previewGame'; readonly gameId: string }
  | { readonly type: 'manualPage'; readonly page: number }
  | { readonly type: 'chooseGame'; readonly gameId: string }
  | { readonly type: 'setHostPlaying'; readonly playing: boolean }

export type ServerToClient =
  | { readonly type: 'welcome'; readonly participantId: string; readonly token: string }
  | { readonly type: 'tableReady'; readonly code: string }
  | { readonly type: 'tableState'; readonly table: TableSnapshot }
  | { readonly type: 'deviceState'; readonly device: DeviceSnapshot }
  | { readonly type: 'error'; readonly code: ErrorCode }
  | { readonly type: 'reload'; readonly reason: 'protocol-version' }
