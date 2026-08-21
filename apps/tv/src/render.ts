import { avatarGlyph } from '@m8/avatars'
import type { ErrorCode, ParticipantSnapshot } from '@m8/protocol'
import { PERSON_COLOR_PROPERTY, personColor } from '@m8/tokens'
import {
  QR_SCATTER_STEP_PROPERTY,
  SCATTER_STEP_PROPERTY,
  arrangePieces,
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
  }

  const image = document.createElement('img')
  image.setAttribute('src', `/qr/${code}.svg`)
  image.setAttribute('alt', '')
  frame.appendChild(image)
  return frame
}

/** The flat terracotta surface everything is laid out on. It is never turned. */
function surface(variant: string): HTMLElement {
  return element('div', `m8-table ${variant}`)
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
 * No colour is written here. A chip element outlives the index its person
 * sits at — that is the whole point of reusing elements — so the colour is
 * written on every update instead, in `updateChip`.
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
 * `arrivalIndex` is where this person sits in the snapshot the server sent,
 * which is what `personColor` means by arrival order and what the phone reads
 * out of the same message. It is deliberately *not* stable across a
 * departure: when the second of four people leaves, the two behind them shift
 * one colour along — on both screens, off the same message.
 *
 * That shift is why the colour is written here rather than where the element
 * is created. It used to be written once, at creation, so the television kept
 * every survivor's original colour while the phones recomputed: the two
 * screens disagreed from the moment anybody left, and the next person to join
 * was handed a colour somebody at the table was already wearing. Two
 * identical colours in one room is the one failure this whole idea exists to
 * prevent.
 */
function updateChip(chip: HTMLElement, person: ParticipantSnapshot, arrivalIndex: number): void {
  // The one colour this person has, on both screens. The stylesheet reads
  // `var(--m8-person)` and stays ignorant of which person it is drawing.
  chip.style.setProperty(PERSON_COLOR_PROPERTY, personColor(arrivalIndex))

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
    updateChip(chip, person, index)
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
