import type { ErrorCode, TableSnapshot } from '@m8/protocol'

export type PhoneScreen =
  | { readonly kind: 'connecting' }
  | { readonly kind: 'no-seat' }
  | { readonly kind: 'profile' }
  | { readonly kind: 'table'; readonly table: TableSnapshot }
  | { readonly kind: 'error'; readonly code: ErrorCode }

/**
 * The server is authoritative and always sends full state, so the phone
 * holds no opinion of its own about which screen belongs on the display: it
 * is read fresh, every time, from the last snapshot. There is deliberately
 * no local "joined" flag here — a participant who is removed from the table,
 * or whose profile the server never accepted, simply falls out of the
 * snapshot and is read below as having no seat, rather than a stale flag
 * going on showing "you are at the table" forever.
 */
export function determineScreen(
  table: TableSnapshot | null,
  participantId: string | null,
  error: ErrorCode | null,
): PhoneScreen {
  if (error !== null) return { kind: 'error', code: error }
  if (table === null) return { kind: 'connecting' }

  const participant =
    participantId === null
      ? undefined
      : table.participants.find((candidate) => candidate.id === participantId)

  if (participant === undefined) return { kind: 'no-seat' }
  if (participant.nickname === '') return { kind: 'profile' }
  return { kind: 'table', table }
}

/**
 * What the person holding the phone is told, per error.
 *
 * A wire code is a word for two servers, not for a person: the likely path
 * here is the server restarting, every phone in the room reconnecting at
 * once and greeting with a code for a table that no longer exists. Whoever
 * is holding the phone then needs one instruction — look up at the screen,
 * which is showing a fresh working code — and never a developer string they
 * can do nothing with.
 *
 * A `Record`, not a `switch`, so a new `ErrorCode` is a type error here
 * rather than a raw token reaching a display.
 */
const ERROR_TEXT: Record<ErrorCode, string> = {
  'unknown-table': 'This table is closed. Scan the code on the screen to join.',
  'invalid-code': 'That is not a table. Scan the code on the screen to join.',
  'table-full': 'This table is full. Scan the code on the screen once a place frees up.',
  'not-allowed': 'That did not work here. Scan the code on the screen to join again.',
  'invalid-message': 'Something went wrong. Scan the code on the screen to join again.',
}

export function errorText(code: ErrorCode): string {
  return ERROR_TEXT[code]
}
