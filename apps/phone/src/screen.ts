import type { DeviceSnapshot, ErrorCode, ServerToClient, TablePhaseName } from '@m8/protocol'

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
 * What the person is told when one *action* was refused and nothing else was.
 *
 * A separate map from `ERROR_TEXT` rather than a second use of it, because
 * every sentence there ends in "scan the code on the screen" — the right
 * instruction for someone who has lost their place, and a lie to someone who
 * has not. This device is still at the table, still holds whatever seat it
 * held, and its next tap may well work; the line says what did not happen and
 * gets out of the way.
 *
 * Total over `ErrorCode` for the same reason `ERROR_TEXT` is, including the
 * codes no action can produce today: a code with no sentence would reach a
 * display as a raw token, and which codes an action can carry is a property of
 * the server, changeable without this file noticing.
 */
const ACTION_REFUSAL_TEXT: Record<ErrorCode, string> = {
  'table-full': 'Every seat is taken.',
  'not-allowed': 'That is not yours to do right now.',
  'invalid-message': 'That did not go through. Try again.',
  'unknown-table': 'This table is no longer open.',
  'invalid-code': 'That is not a table.',
  'table-unavailable': 'The table could not answer that.',
  'stale-round': 'The table has moved on since then.',
}

export function actionRefusalText(code: ErrorCode): string {
  return ACTION_REFUSAL_TEXT[code]
}

/**
 * The two kinds of bad news a phone can be holding at once, kept apart.
 *
 * `session` ends this device at this table and replaces the whole screen;
 * `action` is a line beside a screen that is still perfectly usable. They are
 * separate fields rather than one because they are cleared by different
 * things: a session error survives every state message and is lifted only by a
 * fresh `welcome`, while a refused action is answered by the very next
 * `deviceState` — that state *is* the answer to what the action asked.
 */
export interface PhoneErrorState {
  readonly session: ErrorCode | null
  readonly action: ErrorCode | null
}

export const NO_PHONE_ERRORS: PhoneErrorState = { session: null, action: null }

/**
 * Folds one server message into that pair. A pure function, so both kinds are
 * testable without a socket, a component or a browser — which matters more
 * here than usual: `App.tsx` latching every refusal for good is precisely the
 * defect this replaces, and it was invisible because it lived in a component
 * nothing in this repository can render.
 */
export function nextErrorState(current: PhoneErrorState, message: ServerToClient): PhoneErrorState {
  switch (message.type) {
    // The only message that means "you are at the table": the server restarting
    // has every phone in the room greet a table that no longer exists and be
    // told so, and whoever then scans the fresh code on the screen must land
    // back at the table rather than stay parked on the failure before it.
    case 'welcome':
      return NO_PHONE_ERRORS
    case 'error':
      return { session: message.code, action: null }
    case 'actionRefused':
      return { session: current.session, action: message.code }
    // Not `NO_PHONE_ERRORS`: a state message must never clear a session
    // failure. A phone told its table is closed can still receive one — its
    // socket is live and the server is running — and blinking the failure away
    // would put a dead session back on screen as if nothing had happened.
    case 'deviceState':
      return { session: current.session, action: null }
    default:
      return current
  }
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
