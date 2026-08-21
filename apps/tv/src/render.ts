import { avatarGlyph } from '@m8/avatars'
import type { ErrorCode, ParticipantSnapshot } from '@m8/protocol'
import { PERSON_COLOR_PROPERTY, personColor } from '@m8/tokens'
import { pieceTilt, tiltTransform } from './tilt.js'

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
 * Everything set in the expanded black face is uppercase, and deliberately
 * so: that face is subset to uppercase Latin and digits, because that is all
 * it is ever asked to draw. A lowercase letter set in it would silently fall
 * back to whatever the television has, in the middle of the one line the
 * whole room is reading.
 */
const WORDMARK = 'M8'
const JOIN_EYEBROW = 'SCAN OR TYPE'
const WAITING = 'OPENING THE TABLE'
const FAILED = 'SOMETHING WENT WRONG'
const RECONNECTING = 'RECONNECTING'

/** A participant who has not chosen a name yet, so the row is still a row. */
const NO_NICKNAME = '…'

/**
 * The things lying on the table, numbered left to right: four code tiles,
 * then the QR. `tilt.ts` turns each of them by an angle derived from the
 * code, so one table always arranges itself the same way and two tables do
 * not look alike.
 */
const QR_PIECE_INDEX = 4

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
  row.appendChild(element('p', 'm8-wordmark', WORDMARK))
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
function codeTiles(code: string): HTMLElement {
  const tiles = element('div', 'm8-code')
  for (let index = 0; index < code.length; index += 1) {
    const tile = element('div', 'm8-tile', code.charAt(index))
    tile.style.transform = tiltTransform(pieceTilt(code, index))
    tiles.appendChild(tile)
  }
  return tiles
}

function qrPiece(code: string): HTMLElement {
  const frame = element('div', 'm8-qr')
  frame.style.transform = tiltTransform(pieceTilt(code, QR_PIECE_INDEX))

  const image = document.createElement('img')
  image.setAttribute('src', `/qr/${code}.svg`)
  image.setAttribute('alt', '')
  frame.appendChild(image)
  return frame
}

/** The flat violet surface everything is laid out on. It is never turned. */
function surface(variant: string): HTMLElement {
  return element('div', `m8-table ${variant}`)
}

function buildTable(root: HTMLElement, view: TvView): TableDom {
  root.textContent = ''

  const stage = element('div', 'm8-stage')
  stage.appendChild(eyebrowRow(JOIN_EYEBROW))

  const table = surface('m8-table-join')
  const block = element('div', 'm8-code-block')
  block.appendChild(codeTiles(view.code))
  block.appendChild(element('p', 'm8-address', view.address))
  table.appendChild(block)
  table.appendChild(qrPiece(view.code))
  stage.appendChild(table)

  const people = element('ul', 'm8-people')
  stage.appendChild(people)

  root.appendChild(stage)
  const dom: TableDom = { code: view.code, stage, people, chips: new Map() }
  tables.set(root, dom)
  return dom
}

function newChip(arrivalIndex: number): HTMLElement {
  const chip = element('li', 'm8-chip')
  // The one colour this person has, on both screens. The stylesheet reads
  // `var(--m8-person)` and stays ignorant of which person it is drawing.
  chip.style.setProperty(PERSON_COLOR_PROPERTY, personColor(arrivalIndex))
  chip.appendChild(element('span', 'm8-chip-disc'))
  chip.appendChild(element('span', 'm8-chip-name'))
  return chip
}

function updateChip(chip: HTMLElement, person: ParticipantSnapshot): void {
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
  const name = chip.children[1]
  if (disc === undefined || name === undefined) return

  // The avatar rides inside the disc, so one shape carries both halves of
  // who this is: the colour that is theirs on both screens, and the glyph
  // they chose. Somebody who has not chosen one yet still gets the disc.
  const glyph = avatarGlyph(person.avatarId)
  disc.textContent = glyph === null ? '' : glyph
  name.textContent = person.nickname === '' ? NO_NICKNAME : person.nickname

  const note = chip.children[2]
  if (person.connected) {
    if (note !== undefined) chip.removeChild(note)
    return
  }
  if (note === undefined) chip.appendChild(element('span', 'm8-chip-note', RECONNECTING))
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
    if (person === undefined) continue
    present.add(person.id)

    // Creating an element and somebody arriving are the same event, now that
    // elements are reused: the arrival animation therefore lives on `.m8-chip`
    // itself, with nothing to add or take away afterwards.
    let chip = dom.chips.get(person.id)
    if (chip === undefined) {
      chip = newChip(index)
      dom.chips.set(person.id, chip)
    }
    updateChip(chip, person)

    // Moved only when the order genuinely differs. Re-inserting an element
    // that is already in the right place would restart its animation.
    const occupant = dom.people.childNodes.item(index)
    if (occupant !== chip) dom.people.insertBefore(chip, occupant)
  }

  dom.chips.forEach((chip, id) => {
    if (present.has(id)) return
    dom.people.removeChild(chip)
    dom.chips.delete(id)
  })
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
  renderMessage(root, [element('p', 'm8-headline', WAITING)])
}

/**
 * Shown when the server rejects the screen outright. This is the only
 * diagnostic surface a television has, so the error code is kept on screen
 * in a smaller line rather than only logged somewhere nobody can reach.
 */
export function renderError(root: HTMLElement, code: ErrorCode): void {
  renderMessage(root, [
    element('p', 'm8-headline m8-headline-alarm', FAILED),
    element('p', 'm8-message', 'Reload this screen.'),
    element('p', 'm8-code-line', code),
  ])
}
