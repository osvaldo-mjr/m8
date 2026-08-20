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
