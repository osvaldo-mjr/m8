import type { DeviceSnapshot, ErrorCode, TablePhaseName } from '@m8/protocol'

export type PhoneScreen =
  | { readonly kind: 'connecting' }
  | { readonly kind: 'profile' }
  | { readonly kind: 'choosing'; readonly device: DeviceSnapshot }
  | { readonly kind: 'preview'; readonly device: DeviceSnapshot; readonly gameId: string }
  | { readonly kind: 'seating'; readonly device: DeviceSnapshot }
  | { readonly kind: 'waiting'; readonly device: DeviceSnapshot }
  | { readonly kind: 'error'; readonly code: ErrorCode }

/**
 * The server is authoritative and always sends full state, so the phone
 * holds no opinion of its own about which screen belongs on the display: it
 * is read fresh, every time, from the last `DeviceSnapshot` — decisions, not
 * data, and never a table. There is deliberately no memory across calls: a
 * device that held a seat and no longer does (the host stepping out of his
 * own chair) is read exactly as it reads today, not as a diff against
 * whatever this function last returned.
 *
 * `hasProfile` and `previewedGameId` are the two pieces of state that live
 * on the device rather than the wire — the device's own name and face, and
 * which game it last tapped in the catalogue — because neither is data the
 * server has any reason to track for a phone it never lets choose seats.
 */
export function determineScreen(
  device: DeviceSnapshot | null,
  hasProfile: boolean,
  previewedGameId: string | null,
  error: ErrorCode | null,
): PhoneScreen {
  if (error !== null) return { kind: 'error', code: error }
  if (device === null) return { kind: 'connecting' }
  if (!hasProfile) return { kind: 'profile' }

  // Until a game is chosen, the only device connected is the host's own (see
  // the design's §3.1) — so these two phases are always his screens, browsing
  // and previewing, never another player's waiting room.
  if (device.phase === 'awaiting-host' || device.phase === 'choosing-game') {
    return previewedGameId === null
      ? { kind: 'choosing', device }
      : { kind: 'preview', device, gameId: previewedGameId }
  }

  // The seating screen belongs to whoever holds a seat, and to the host even
  // without one of his own — he keeps running the table while stepped out of
  // it. Anyone else reaches this branch only defensively; there is no seat to
  // show and no baton to run the table with, so they wait like everyone in a
  // phase this plan draws no screen for.
  if (device.phase === 'seating' && (device.hasBaton || device.seatNumber !== null)) {
    return { kind: 'seating', device }
  }

  return { kind: 'waiting', device }
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
  // A screen-only failure in practice — a phone never asks for a table to be
  // opened — but this map is total, so it gets an honest sentence rather
  // than a placeholder.
  'table-unavailable': 'No table could be opened. Whoever set up the screen will have to restart it.',
  'stale-round': 'This table has moved on. Scan the code on the screen to join again.',
}

export function errorText(code: ErrorCode): string {
  return ERROR_TEXT[code]
}

/**
 * Why the start control is disabled, from the number the server already
 * counted — never recomputed from seats on this side, so the phone and the
 * server can never disagree about how many more are needed. `null` means
 * nothing is missing, which the caller reads as "start is enabled", not as
 * "say nothing".
 */
export function startReasonText(playersNeeded: number): string | null {
  if (playersNeeded <= 0) return null
  return playersNeeded === 1 ? 'Waiting for one more player.' : `Waiting for ${playersNeeded} more players.`
}

/**
 * What tapping an *enabled* START says. There is no wire message yet for
 * actually starting a match — see `App.tsx`'s seating screen — but the
 * button still lights up the moment the table is ready, because that light-up
 * is this plan's own proof that the server's decision reached the phone. The
 * tap must stay honest rather than silent: a host who watches the button
 * enable, taps it as the obvious next step, and gets nothing back will
 * reasonably conclude the app is broken. This is what the tap answers with
 * instead — plain enough for a living room, not a developer's placeholder.
 */
export const START_NOT_YET_TEXT =
  'The table is ready. Starting the match arrives with the first real game — coming soon.'

/**
 * What the waiting screen says, per phase. A `Record` over every phase this
 * plan's wire can name, not only the ones `determineScreen` actually routes
 * here today — the same reasoning as `ERROR_TEXT`: a phase this function has
 * no opinion about is a type error, not a blank screen.
 */
const WAITING_TEXT: Record<TablePhaseName, string> = {
  'awaiting-host': 'Watch the big screen.',
  'choosing-game': 'Watch the big screen.',
  seating: 'Waiting for a seat to open up.',
  playing: 'The match is on. Watch the big screen.',
  paused: 'The match is paused. Watch the big screen.',
  'awaiting-seat': 'Waiting for someone to take the empty seat.',
  finished: 'The match is over. Watch the big screen.',
}

export function waitingText(phase: TablePhaseName): string {
  return WAITING_TEXT[phase]
}
