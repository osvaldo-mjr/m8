import { avatarGlyph } from '@m8/avatars'
import type { ErrorCode, Locale, ParticipantSnapshot, SeatSnapshot, TableSnapshot } from '@m8/protocol'
import { PERSON_COLOR_PROPERTY, seatColor } from '@m8/tokens'
import {
  QR_SCATTER_STEP_PROPERTY,
  SCATTER_STEP_PROPERTY,
  arrangePieces,
  pieceShadow,
  pieceSpacing,
  pieceTransform,
} from './tilt.js'
import type { PiecePlacement } from './tilt.js'

export interface TvView {
  readonly code: string
  /**
   * Where to type the code, for a phone with no camera or a camera that will
   * not focus. Comes from the host the screen itself was loaded from, so it
   * can no more say `localhost` than the QR can.
   */
  readonly address: string
  readonly participants: readonly ParticipantSnapshot[]
}

/**
 * Which language this screen reads a manual in. The wire carries both —
 * `PreviewSnapshot`'s `name`, `title` and `lines` are all `Record<Locale,
 * …>` — and this constant is the entire surface a later language switch
 * would touch: nothing else in this file makes a locale decision.
 */
export const SCREEN_LOCALE: Locale = 'pt-BR'

/** What `renderChoosing` draws: the box on the left, the manual on the right. */
export interface ChoosingView {
  readonly code: string
  readonly cover: string
  readonly title: Record<Locale, string>
  readonly lines: Record<Locale, readonly string[]>
  readonly page: number
  readonly pageCount: number
}

/**
 * What `renderSeating` draws: every seat, filled or not, the QR while one is
 * free, and whoever holds the baton.
 *
 * `qrVisible` is read from the snapshot rather than re-derived from `seats`:
 * the domain already computes exactly when a table may still be joined —
 * "while any seat is free" reads as the obvious rule until a seat vacates
 * mid-match and the QR must *not* return outside seating, which this screen
 * has no way to know on its own. Trusting the field is what keeps that rule
 * in one place.
 *
 * `batonHolder` is a participant, not a seat, because the whole point of
 * §3.3 is that the two may not coincide: the host can run the table from no
 * chair at all, and is still owed a mark on screen.
 */
export interface SeatingView {
  readonly code: string
  readonly address: string
  readonly seats: readonly SeatSnapshot[]
  readonly qrVisible: boolean
  readonly batonHolder: ParticipantSnapshot | null
}

/**
 * Every string this screen sets in the expanded black face, in one place.
 *
 * That face is not merely "uppercase": it is subset to `[A-Z0-9 ]`, plus the
 * uppercase accented letters pt-BR needs. There is no hyphen in it, no full
 * stop and no apostrophe. A character outside the subset does not merely look
 * different — it falls through to whatever the television has, in the middle
 * of the one line the whole room is reading.
 *
 * That is about to matter rather than being theoretical: the first game is
 * tic-tac-toe, and an eyebrow reading `TIC-TAC-TOE` would drop its three
 * hyphens into a fallback font and say nothing about it.
 *
 * Exported so `render.test.ts` can assert the whole set against the subset.
 * Every display-face string in this file comes from here, so a new headline
 * is only ever added by adding a member — and the test then covers it.
 */
export const DISPLAY_FACE_STRINGS = {
  wordmark: 'M8',
  joinEyebrow: 'SCAN OR TYPE',
  waiting: 'OPENING THE TABLE',
  failed: 'SOMETHING WENT WRONG',
  reconnecting: 'RECONNECTING',
} as const

/** The characters the expanded black instance was subset to, for `A-Z0-9 `. */
export const DISPLAY_FACE_SUBSET = /^[A-Z0-9 ]+$/

/** A participant who has not chosen a name yet, so the row is still a row. */
const NO_NICKNAME = '…'

/**
 * The word that marks the baton holder, on `renderSeating`.
 *
 * Set in `--m8-font-text`, not the expanded black face `DISPLAY_FACE_STRINGS`
 * is subset for — the word sits beside a nickname nobody chose from a
 * controlled alphabet, so the line it lives on has to render arbitrary
 * Unicode regardless of what this word alone would tolerate.
 */
const HOST_LABEL = 'HOST'

/**
 * How many people sit abreast at most, which is also the cap on how wide one
 * chip may be: a quarter of the row, so eight fit on the two lines the screen
 * has room for.
 *
 * The number is written on the row as `data-abreast` and the stylesheet reads
 * it, for one reason: below four, the cap is width nobody is using. A table of
 * two with the cap always applied truncates two nicknames on a screen with
 * three quarters of its row empty. So the row says how many sit abreast —
 * never more than this — and the stylesheet relaxes the cap to match.
 *
 * The direction of the failure is deliberate. `.m8-chip` carries the quarter
 * unconditionally and the relaxations are additions on top, so an attribute
 * that never arrives leaves the strict cap in force rather than removing it.
 */
export const CHIPS_ABREAST = 4

/**
 * The things lying on the table, numbered left to right: four code tiles,
 * then the QR. `tilt.ts` turns, lifts and spaces each of them from the code,
 * so one table always arranges itself the same way and two tables do not look
 * alike.
 */
const QR_PIECE_INDEX = 4
const PIECE_COUNT = QR_PIECE_INDEX + 1

/**
 * The two things on the table while a game is being chosen: the box, then
 * the manual. Its own small count, scattered by the same `tilt.ts` the code
 * tiles and the QR use — see `renderChoosing`.
 */
const BOX_PIECE_INDEX = 0
const MANUAL_PIECE_INDEX = 1
const CHOOSING_PIECE_COUNT = MANUAL_PIECE_INDEX + 1

/**
 * What is currently on screen, per root.
 *
 * A `tableState` arrives every time anyone joins, renames or drops, and the
 * screen redraws on each one. Rebuilding the tree each time costs two things
 * that matter on a television: the QR `<img>` is refetched and blinks — the
 * one element in the room people are pointing a camera at — and every chip
 * replays the arrival animation, so the whole row flickers whenever one
 * person joins. Both are answered by keeping the tree and updating it.
 *
 * Keyed on the root rather than held in a module variable, so two roots
 * cannot share one tree and nothing is retained once a root is discarded.
 */
interface TableDom {
  readonly code: string
  readonly stage: HTMLElement
  readonly people: HTMLElement
  readonly chips: Map<string, HTMLElement>
}

const tables = new WeakMap<HTMLElement, TableDom>()

/**
 * What is currently on the seating screen, per root — the same reuse
 * `TableDom` exists for and for the same two reasons: the QR should not
 * blink on every occupant change, and a chip should not replay its arrival
 * animation on every unrelated update.
 *
 * `seatChips` is built once, in seat order, and never reordered or removed:
 * unlike the join screen's row, a seat's position in this row is not up for
 * negotiation — it is the seat number, fixed for as long as the seats exist
 * — so there is no join-screen-style diffing to do here, only updating each
 * slot in place.
 *
 * `qrVisible` is carried so a toggle of it can be told apart from every
 * other reason this screen redraws: the code and the QR are only rebuilt
 * when it actually flips, not on every seat update while it holds steady.
 */
interface SeatingDom {
  readonly code: string
  readonly qrVisible: boolean
  readonly stage: HTMLElement
  readonly host: HTMLElement
  readonly seats: HTMLElement
  readonly seatChips: readonly HTMLElement[]
}

const seatingScreens = new WeakMap<HTMLElement, SeatingDom>()

function element(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag)
  node.className = className
  // Nicknames are free text typed by strangers on a screen in a shared room:
  // textContent only, never innerHTML, so nothing typed can render as markup.
  if (text !== undefined) node.textContent = text
  return node
}

function eyebrowRow(right?: string): HTMLElement {
  const row = element('div', 'm8-eyebrow-row')
  row.appendChild(element('p', 'm8-wordmark', DISPLAY_FACE_STRINGS.wordmark))
  if (right !== undefined) row.appendChild(element('p', 'm8-eyebrow', right))
  return row
}

/**
 * The four code characters as four objects, not as a word.
 *
 * The alphabet has no O, no I, no zero and no one precisely because every
 * character of a table code is read out and typed on its own; drawing them
 * as four tiles is that fact made visible.
 */
function codeTiles(code: string, placements: readonly PiecePlacement[]): HTMLElement {
  const tiles = element('div', 'm8-code')
  for (let index = 0; index < code.length; index += 1) {
    const placement = placements[index]
    const tile = element('div', 'm8-tile', code.charAt(index))
    if (placement !== undefined) {
      tile.style.transform = pieceTransform(placement, SCATTER_STEP_PROPERTY)
      // Away from the middle of the table, because that is where the lamp is.
      tile.style.boxShadow = pieceShadow(placement, index, PIECE_COUNT)
      // The gap after this tile, which the last one does not have — the
      // stylesheet already zeroes its margin, and an inline style would win
      // over that rule and put a gap between the code and the QR that the
      // block margin is there to set.
      if (index < code.length - 1) {
        tile.style.marginRight = pieceSpacing(placement, SCATTER_STEP_PROPERTY)
      }
    }
    tiles.appendChild(tile)
  }
  return tiles
}

function qrPiece(placement: PiecePlacement | undefined, code: string): HTMLElement {
  const frame = element('div', 'm8-qr')
  if (placement !== undefined) {
    // Its own, smaller step. The QR is the largest thing on the table, so its
    // turned and lifted bounding box is what sets the least height the table
    // can be drawn in — and it lies alone rather than in a row, so there is
    // no baseline for it to break out of. A large lift here would cost the
    // row of people real space and buy nothing anybody can see.
    frame.style.transform = pieceTransform(placement, QR_SCATTER_STEP_PROPERTY)
    // The piece furthest from the middle of the table, so the one whose
    // shadow is thrown furthest — and the reason the safe-area model charges
    // a shadow sideways as well as downwards.
    frame.style.boxShadow = pieceShadow(placement, QR_PIECE_INDEX, PIECE_COUNT)
  }

  const image = document.createElement('img')
  image.setAttribute('src', `/qr/${code}.svg`)
  image.setAttribute('alt', '')
  frame.appendChild(image)
  return frame
}

/** The wooden surface everything is laid out on. It is never turned. */
function surface(variant: string): HTMLElement {
  return element('div', `m8-table ${variant}`)
}

/**
 * What is currently on the choosing screen, per root — the same reuse
 * `TableDom` above exists for, and for the same reason: the box's cover
 * `<img>` is the one element in this screen anyone stares at while turning
 * pages, and rebuilding it on every `manualPage` tap would refetch and blink
 * it, the way a rebuilt QR would. Keyed on `code` rather than on the game
 * being previewed, because the scatter — the transform on the box and the
 * manual — is derived from the table's code alone: browsing several games at
 * one table never moves either piece, only what is drawn inside them.
 */
interface ChoosingDom {
  readonly code: string
  readonly stage: HTMLElement
  readonly cover: HTMLImageElement
  readonly title: HTMLElement
  readonly lines: HTMLElement
  readonly page: HTMLElement
}

const choosingScreens = new WeakMap<HTMLElement, ChoosingDom>()

function buildChoosing(root: HTMLElement, code: string): ChoosingDom {
  root.textContent = ''

  const stage = element('div', 'm8-stage')
  stage.appendChild(eyebrowRow())

  // One call for both pieces, exactly as the join screen draws one call for
  // its five — the guarantee that neighbours differ is about the pair, not
  // about either piece alone.
  const placements = arrangePieces(code, CHOOSING_PIECE_COUNT)
  const boxPlacement = placements[BOX_PIECE_INDEX]
  const manualPlacement = placements[MANUAL_PIECE_INDEX]

  const table = surface('m8-table-choosing')

  const box = element('div', 'm8-box')
  if (boxPlacement !== undefined) {
    box.style.transform = pieceTransform(boxPlacement, QR_SCATTER_STEP_PROPERTY)
    box.style.boxShadow = pieceShadow(boxPlacement, BOX_PIECE_INDEX, CHOOSING_PIECE_COUNT)
    box.style.marginRight = pieceSpacing(boxPlacement, QR_SCATTER_STEP_PROPERTY)
  }
  const cover = document.createElement('img')
  cover.setAttribute('alt', '')
  box.appendChild(cover)
  table.appendChild(box)

  const manual = element('div', 'm8-manual')
  if (manualPlacement !== undefined) {
    manual.style.transform = pieceTransform(manualPlacement, QR_SCATTER_STEP_PROPERTY)
    manual.style.boxShadow = pieceShadow(manualPlacement, MANUAL_PIECE_INDEX, CHOOSING_PIECE_COUNT)
  }
  const title = element('p', 'm8-manual-title')
  const lines = element('div', 'm8-manual-lines')
  const page = element('p', 'm8-manual-page')
  manual.appendChild(title)
  manual.appendChild(lines)
  manual.appendChild(page)
  table.appendChild(manual)

  stage.appendChild(table)
  root.appendChild(stage)

  const dom: ChoosingDom = { code, stage, cover, title, lines, page }
  choosingScreens.set(root, dom)
  return dom
}

/** Brings the box and the manual up to date, without disturbing either element. */
function syncChoosing(dom: ChoosingDom, view: ChoosingView): void {
  // Only actually written when it changes, so browsing back to a game
  // already shown does not even touch the attribute, let alone the network.
  if (dom.cover.getAttribute('src') !== view.cover) dom.cover.setAttribute('src', view.cover)

  dom.title.textContent = view.title[SCREEN_LOCALE]

  dom.lines.textContent = ''
  for (const line of view.lines[SCREEN_LOCALE]) dom.lines.appendChild(element('p', 'm8-manual-line', line))

  // 1-based for the room: `page` is the zero-based index the wire carries,
  // the same one `clampPage` on the server produces.
  dom.page.textContent = `${view.page + 1} of ${view.pageCount}`
}

function buildTable(root: HTMLElement, view: TvView): TableDom {
  root.textContent = ''

  const stage = element('div', 'm8-stage')
  stage.appendChild(eyebrowRow(DISPLAY_FACE_STRINGS.joinEyebrow))

  // One call for the whole table, not one per piece: the guarantee that two
  // neighbours are visibly different cannot be made by a piece on its own.
  const placements = arrangePieces(view.code, PIECE_COUNT)

  const table = surface('m8-table-join')
  const block = element('div', 'm8-code-block')
  block.appendChild(codeTiles(view.code, placements))
  block.appendChild(element('p', 'm8-address', view.address))
  table.appendChild(block)
  table.appendChild(qrPiece(placements[QR_PIECE_INDEX], view.code))
  stage.appendChild(table)

  const people = element('ul', 'm8-people')
  stage.appendChild(people)

  root.appendChild(stage)
  const dom: TableDom = { code: view.code, stage, people, chips: new Map() }
  tables.set(root, dom)
  return dom
}

/**
 * The shape of one chip: a disc, and a column of text beside it.
 *
 * The text is a column rather than a row because the chip is capped at a
 * quarter of the row's width — see `.m8-chip` in `styles.css` — and
 * `RECONNECTING` set beside a nickname does not fit in a quarter of a
 * 1280-wide screen. Stacked, the word sits under the name, the chip stays
 * inside its quarter whatever anybody typed, and the disc is still the
 * tallest thing in it, so the row does not change height when somebody drops.
 *
 * No colour is written here. A chip element outlives whoever it is currently
 * drawing — a row position on the join screen, a seat here — which is the
 * whole point of reusing elements, so the colour is written on every update
 * instead, in `updateChip` or `updateEmptySeat`.
 */
function newChip(): HTMLElement {
  const chip = element('li', 'm8-chip')
  chip.appendChild(element('span', 'm8-chip-disc'))
  const text = element('div', 'm8-chip-text')
  text.appendChild(element('span', 'm8-chip-name'))
  chip.appendChild(text)
  return chip
}

/**
 * Brings one chip up to date, including its colour.
 *
 * `colour` is a finished CSS value — `var(--m8-person-N)` — handed in by the
 * caller rather than computed here, because the two callers derive it from
 * different things: the join screen, where the host is alone before any seat
 * exists, from his position in the row; `renderSeating`, from the seat he is
 * actually sitting in. Neither shifts a survivor's colour when somebody else
 * leaves, which is what `personColor`'s old arrival-index scheme did — the
 * television kept every survivor's original colour while the phones
 * recomputed a shifted one, and the two screens disagreed from the moment
 * anybody left. Two identical colours in one room is the one failure this
 * whole idea exists to prevent.
 */
function updateChip(chip: HTMLElement, person: ParticipantSnapshot, colour: string): void {
  // The one colour this person has, on both screens. The stylesheet reads
  // `var(--m8-person)` and stays ignorant of which person it is drawing.
  chip.style.setProperty(PERSON_COLOR_PROPERTY, colour)

  // These are for tests and for whoever inspects the DOM. Nobody in the room
  // can see an attribute, so the difference a person has to notice is carried
  // by the classes and by a word, never by these.
  chip.setAttribute('data-baton', String(person.hasBaton))
  chip.setAttribute('data-connected', String(person.connected))

  // A dropped participant has to be legible as dropped from three metres, by
  // someone who cannot touch the screen to investigate: their disc empties
  // out to an outline of their own colour, and the row says so in a word.
  chip.className = person.connected ? 'm8-chip' : 'm8-chip m8-chip-away'

  const disc = chip.children[0]
  const text = chip.children[1]
  if (disc === undefined || text === undefined) return
  const name = text.children[0]
  if (name === undefined) return

  // The avatar rides inside the disc, so one shape carries both halves of
  // who this is: the colour that is theirs on both screens, and the glyph
  // they chose. Somebody who has not chosen one yet still gets the disc.
  const glyph = avatarGlyph(person.avatarId)
  disc.textContent = glyph === null ? '' : glyph
  name.textContent = person.nickname === '' ? NO_NICKNAME : person.nickname

  const note = text.children[1]
  if (person.connected) {
    if (note !== undefined) text.removeChild(note)
    return
  }
  if (note === undefined) {
    text.appendChild(element('span', 'm8-chip-note', DISPLAY_FACE_STRINGS.reconnecting))
  }
}

/**
 * Draws a seat nobody has claimed — a place set at the table rather than a
 * gap in the row, so the room can see there is a chair free without counting
 * what is missing.
 *
 * `.m8-chip-away` is reused rather than invented: it is already the outline
 * of a colour with nothing filled in, which is exactly what an empty chair
 * is. The seat's own number stands where a glyph would, since there is no
 * avatar yet to draw — and no nickname, which is `NO_NICKNAME`'s job for a
 * seat somebody has claimed but not yet named. This is a stronger claim than
 * that: nobody has sat down at all.
 */
function updateEmptySeat(chip: HTMLElement, seat: SeatSnapshot): void {
  chip.style.setProperty(PERSON_COLOR_PROPERTY, seatColor(seat.number))
  chip.className = 'm8-chip m8-chip-away'
  // The same chip element is reused across seat 3's whole life — occupied,
  // vacated, occupied again by somebody else — so a stale attribute from a
  // previous occupant must not survive into an empty render.
  chip.removeAttribute('data-baton')
  chip.removeAttribute('data-connected')

  const disc = chip.children[0]
  const text = chip.children[1]
  if (disc === undefined || text === undefined) return
  disc.textContent = String(seat.number)

  const name = text.children[0]
  if (name !== undefined) name.textContent = ''
  const note = text.children[1]
  if (note !== undefined) text.removeChild(note)
}

/**
 * The row of people along the near edge of the table, in arrival order.
 *
 * Elements are reused and only a genuinely new one is animated. That is the
 * whole point of the reuse: the person who just scanned the code is looking
 * up at the television to find out whether their phone connected, and the
 * one moment of motion in this product is that answer. If every chip
 * re-animated on every message, the confirmation would be noise.
 */
function syncPeople(dom: TableDom, participants: readonly ParticipantSnapshot[]): void {
  const present = new Set<string>()
  for (let index = 0; index < participants.length; index += 1) {
    const person = participants[index]
    if (person !== undefined) present.add(person.id)
  }

  // Whoever left goes first, before anybody is placed.
  //
  // The order is not tidiness. Placing against a row that still holds a
  // departed chip makes every survivor behind them look misplaced, and each
  // one is then re-inserted — which in Blink is a remove and an insert, so
  // each one replays the arrival animation. The one signal this product has,
  // "your phone connected", would fire for three people at the moment a
  // fourth left. Taking the gap out first leaves every survivor already where
  // it belongs, and nothing moves.
  dom.chips.forEach((chip, id) => {
    if (present.has(id)) return
    dom.people.removeChild(chip)
    dom.chips.delete(id)
  })

  // Placement compares each chip against the one that should precede it,
  // rather than against whatever happens to occupy its index. An index
  // comparison reads a row mid-rearrangement and disagrees with itself; the
  // previous sibling is the only neighbour already known to be in its final
  // place.
  let previous: Node | null = null
  for (let index = 0; index < participants.length; index += 1) {
    const person = participants[index]
    if (person === undefined) continue

    // Creating an element and somebody arriving are the same event, now that
    // elements are reused: the arrival animation therefore lives on `.m8-chip`
    // itself, with nothing to add or take away afterwards.
    let chip = dom.chips.get(person.id)
    if (chip === undefined) {
      chip = newChip()
      dom.chips.set(person.id, chip)
    }
    if (chip.parentNode !== dom.people || chip.previousSibling !== previous) {
      dom.people.insertBefore(chip, previous === null ? dom.people.firstChild : previous.nextSibling)
    }
    // No seat exists yet at this phase — nobody may join before a game is
    // chosen, so this row is the host alone — so the row's own position is
    // the only thing to colour by, one-based to match how `seatColor` names
    // its slots. That position still shifts a survivor's colour if this were
    // ever fed more than one participant — pinned deliberately, rather than
    // left silently unguarded, in render.test.ts's "still shifts a survivor
    // one colour along when somebody ahead of them leaves".
    updateChip(chip, person, seatColor(index + 1))
    previous = chip
  }

  dom.people.setAttribute('data-abreast', String(Math.min(participants.length, CHIPS_ABREAST)))
}

/**
 * The large screen displays and nothing else: no buttons, no links, no focus.
 * Written against the DOM directly because this tree is structurally almost
 * static, and because a framework runtime is weight the target hardware
 * should not have to carry.
 */
export function renderTable(root: HTMLElement, view: TvView): void {
  const existing = tables.get(root)
  // A different code is a different table: different tilts, a different QR.
  // A detached stage means something else — a waiting or an error screen —
  // has cleared this root since, so there is nothing left to update.
  const reusable =
    existing !== undefined && existing.code === view.code && existing.stage.parentNode === root

  syncPeople(reusable && existing !== undefined ? existing : buildTable(root, view), view.participants)
}

/**
 * The badge that marks the baton holder, independent of any seat.
 *
 * It is drawn in the eyebrow row rather than as one more chip in the seats
 * row, on purpose: the host may hold no seat at all, so there is no slot in
 * that row to draw him in, and a row sized for `seats.length` has no spare
 * place for him even when he does sit — the row is already proven to fit at
 * `MAX_SEATS`, and a host who sits *and* keeps a separate badge would be
 * `MAX_SEATS + 1` identities wide in the worst case. One fixed-size badge,
 * always in the same place, sidesteps that entirely.
 *
 * There is always exactly one baton holder for as long as a table exists, so
 * `batonHolder === null` is not a state this screen expects to draw — it is
 * handled by leaving the badge blank rather than by throwing, because a
 * table drawn with one missing label is a smaller failure on a television
 * than a blank screen.
 *
 * The badge's own box never grows with what is written into it — see
 * `.m8-host` in `styles.css` — which is what lets `scripts/tv-safe-area.ts`
 * charge a fixed height for it regardless of nickname length.
 */
function updateHost(host: HTMLElement, batonHolder: ParticipantSnapshot | null): void {
  if (batonHolder === null) {
    host.textContent = ''
    return
  }
  const glyph = avatarGlyph(batonHolder.avatarId)
  const name = batonHolder.nickname === '' ? NO_NICKNAME : batonHolder.nickname
  host.textContent = glyph === null ? `${HOST_LABEL} ${name}` : `${HOST_LABEL} ${glyph} ${name}`
}

/**
 * What is currently on the seating screen — the eyebrow, the host badge, the
 * code and the QR while `qrVisible`, and one chip per seat, built once in
 * seat order and never reordered: unlike the join screen's row, a seat's
 * place in this row is its own number, fixed for as long as the seats exist.
 */
function buildSeating(root: HTMLElement, view: SeatingView): SeatingDom {
  root.textContent = ''

  const stage = element('div', 'm8-stage')
  const eyebrow = element('div', 'm8-eyebrow-row')
  eyebrow.appendChild(element('p', 'm8-wordmark', DISPLAY_FACE_STRINGS.wordmark))
  const host = element('p', 'm8-host')
  eyebrow.appendChild(host)
  stage.appendChild(eyebrow)

  if (view.qrVisible) {
    // The same five pieces the join screen scatters, through the same
    // function, so a table that is still being seated looks like the same
    // table that was waiting for the host — not a second design.
    const placements = arrangePieces(view.code, PIECE_COUNT)
    const table = surface('m8-table-seating')
    const block = element('div', 'm8-code-block')
    block.appendChild(codeTiles(view.code, placements))
    block.appendChild(element('p', 'm8-address', view.address))
    table.appendChild(block)
    table.appendChild(qrPiece(placements[QR_PIECE_INDEX], view.code))
    stage.appendChild(table)
  }

  const seats = element('ul', 'm8-people')
  seats.setAttribute('data-abreast', String(Math.min(view.seats.length, CHIPS_ABREAST)))
  const seatChips: HTMLElement[] = []
  for (const seat of view.seats) {
    const chip = newChip()
    seats.appendChild(chip)
    seatChips.push(chip)
  }
  stage.appendChild(seats)

  root.appendChild(stage)
  const dom: SeatingDom = { code: view.code, qrVisible: view.qrVisible, stage, host, seats, seatChips }
  seatingScreens.set(root, dom)
  return dom
}

/** Brings every seat, and the host badge, up to date without disturbing the tree. */
function syncSeating(dom: SeatingDom, view: SeatingView): void {
  for (let index = 0; index < view.seats.length; index += 1) {
    const seat = view.seats[index]
    const chip = dom.seatChips[index]
    if (seat === undefined || chip === undefined) continue
    if (seat.occupant === null) updateEmptySeat(chip, seat)
    else updateChip(chip, seat.occupant, seatColor(seat.number))
  }
  updateHost(dom.host, view.batonHolder)
}

/**
 * The seats around the table: who is sitting where, which places are still
 * open, the QR while any is, and the baton holder marked whether or not he
 * is one of them.
 *
 * Reuses its tree exactly as `renderTable` and `renderChoosing` do, and adds
 * one more reason to: unlike either of those, whether the QR is on the table
 * at all can change between two renders of the *same* table, the instant the
 * last seat fills or a seated player leaves — so that, and not only the
 * code, is part of what "the same screen" means here.
 */
export function renderSeating(root: HTMLElement, view: SeatingView): void {
  const existing = seatingScreens.get(root)
  const reusable =
    existing !== undefined &&
    existing.code === view.code &&
    existing.qrVisible === view.qrVisible &&
    existing.seatChips.length === view.seats.length &&
    existing.stage.parentNode === root

  syncSeating(reusable && existing !== undefined ? existing : buildSeating(root, view), view)
}

/**
 * The box on the left, the manual open beside it. Both are placed through
 * the same scatter the code tiles and the QR use, so a box reads as
 * something set down on the table rather than as a panel — see
 * `buildChoosing` and `tilt.ts`.
 *
 * Reuses its tree exactly as `renderTable` reuses its own, and for the same
 * two reasons: the cover `<img>` should not blink on every page turn, and
 * the arrival animation nothing here has does not need re-triggering — but
 * the *tree* still has to survive a `manualPage` tap without moving, which
 * is what element reuse buys regardless.
 */
export function renderChoosing(root: HTMLElement, view: ChoosingView): void {
  const existing = choosingScreens.get(root)
  // A different code is a different table: a different scatter for both
  // pieces. A detached stage means some other screen has cleared this root
  // since, so there is nothing left to update.
  const reusable =
    existing !== undefined && existing.code === view.code && existing.stage.parentNode === root

  syncChoosing(reusable && existing !== undefined ? existing : buildChoosing(root, view.code), view)
}

function renderMessage(root: HTMLElement, lines: readonly HTMLElement[]): void {
  root.textContent = ''
  const stage = element('div', 'm8-stage')
  stage.appendChild(eyebrowRow())

  const table = surface('m8-table-message')
  for (const line of lines) table.appendChild(line)
  stage.appendChild(table)
  root.appendChild(stage)
}

/**
 * Shown from the moment the page loads until the first `tableState` arrives.
 * The screen must never be blank: nobody in the room can open developer
 * tools on a television to find out whether it is broken or just slow.
 */
export function renderWaiting(root: HTMLElement): void {
  renderMessage(root, [element('p', 'm8-headline', DISPLAY_FACE_STRINGS.waiting)])
}

/**
 * Shown when the server rejects the screen outright. This is the only
 * diagnostic surface a television has, so the error code is kept on screen
 * in a smaller line rather than only logged somewhere nobody can reach.
 */
export function renderError(root: HTMLElement, code: ErrorCode): void {
  renderMessage(root, [
    element('p', 'm8-headline m8-headline-alarm', DISPLAY_FACE_STRINGS.failed),
    element('p', 'm8-message', 'Reload this screen.'),
    element('p', 'm8-code-line', code),
  ])
}

/**
 * Chooses the screen for one `tableState` and draws it — the one place the
 * wire's seven phases meet the screens this plan actually draws.
 *
 * Nothing in this plan can start a match, so `playing`, `paused`,
 * `awaiting-seat` and `finished` can arrive on the wire but never really
 * happen; they fall to the waiting screen the room already saw before the
 * first `tableState` did. `choosing-game` falls there too in the one instant
 * nobody has previewed a game yet: the host has arrived but not tapped
 * anything, `table.preview` is still `null`, and there is nothing this plan
 * draws for that moment either.
 *
 * A `switch` that silently rendered nothing for a phase it had not met yet
 * would leave a blank television with no way to tell why — the one failure
 * this target cannot be debugged through — so every member of
 * `TablePhaseName` is named below, and the `default` case fails to
 * typecheck if a new one is ever added without a case naming it.
 */
export function renderScreen(root: HTMLElement, table: TableSnapshot, address: string): void {
  switch (table.phase) {
    case 'awaiting-host':
      renderTable(root, { code: table.code, address, participants: table.participants })
      return

    case 'choosing-game':
      if (table.preview === null) {
        renderWaiting(root)
        return
      }
      renderChoosing(root, {
        code: table.code,
        cover: table.preview.cover,
        title: table.preview.title,
        lines: table.preview.lines,
        page: table.preview.page,
        pageCount: table.preview.pageCount,
      })
      return

    case 'seating':
      renderSeating(root, {
        code: table.code,
        address,
        seats: table.seats,
        qrVisible: table.qrVisible,
        batonHolder: table.participants.find((person) => person.hasBaton) ?? null,
      })
      return

    case 'playing':
    case 'paused':
    case 'awaiting-seat':
    case 'finished':
      renderWaiting(root)
      return

    default: {
      const unreachable: never = table.phase
      renderWaiting(root)
      return unreachable
    }
  }
}
