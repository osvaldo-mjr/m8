/**
 * How far each thing lying on the table is turned, in degrees.
 *
 * A real table does not have its contents squared up. The four code tiles and
 * the QR are each turned a little, which is what makes them read as objects
 * placed on a surface rather than as boxes in a layout. The table itself and
 * the row of people stay rigid: the contrast is what sells it, and counting
 * the people around the table is a real glance-task that a tilted row would
 * cost.
 *
 * Three properties this has to have, and the reason for each:
 *
 *   - Small angles. The code is the one thing in the room that must be read
 *     correctly from three metres and typed by a stranger; past roughly six
 *     degrees that starts to cost. The QR is safe at any angle — QR decoding
 *     is rotation-invariant by design — but it is turned by the same rule so
 *     that the arrangement is one gesture rather than two.
 *   - Stable. Derived from the table code, so the same table always arranges
 *     itself the same way. Random-per-render would make every piece twitch
 *     each time anybody joined or renamed, because a `tableState` arrives on
 *     each of those and the screen redraws.
 *   - Not identical between tables. Fixed angles would make every table in
 *     every room the same picture.
 *
 * Which is a hash, and nothing else: no state, no storage, no clock.
 */

/** The smallest turn a piece is given. Zero would look like a mistake. */
export const TILT_MIN_DEGREES = 2

/** The largest. Beyond this the code stops being comfortable to read. */
export const TILT_MAX_DEGREES = 4

/** Steps of half a degree between the two, inclusive: 2, 2.5, 3, 3.5, 4. */
const TILT_STEP_DEGREES = 0.5
const TILT_STEP_COUNT = (TILT_MAX_DEGREES - TILT_MIN_DEGREES) / TILT_STEP_DEGREES + 1

/**
 * FNV-1a over the code and the piece's position, in 32-bit integer
 * arithmetic throughout, finished with murmur3's avalanche step.
 *
 * `Math.imul` rather than `*`: the multiply overflows the range JavaScript
 * numbers hold exactly, and a plain multiplication would silently lose the
 * low bits that are the whole point of the mix.
 *
 * The avalanche is not decoration. Five pieces of one table differ only in
 * the last thing folded in, so without it the five hashes of a table differ
 * in a handful of low bits, and the arrangement of the whole table collapses
 * onto a few shapes: measured over nine hundred codes, plain FNV-1a produced
 * 131 distinct arrangements where the finished hash produces 897.
 */
function hash(code: string, pieceIndex: number): number {
  let value = 0x811c9dc5
  for (let i = 0; i < code.length; i += 1) {
    value ^= code.charCodeAt(i)
    value = Math.imul(value, 0x01000193) >>> 0
  }
  value ^= pieceIndex + 1
  value = Math.imul(value, 0x01000193) >>> 0

  value ^= value >>> 16
  value = Math.imul(value, 0x85ebca6b) >>> 0
  value ^= value >>> 13
  value = Math.imul(value, 0xc2b2ae35) >>> 0
  value ^= value >>> 16
  return value >>> 0
}

/**
 * The angle for one piece of one table, in degrees, negative or positive.
 *
 * `pieceIndex` numbers the things lying on the table: the code tiles left to
 * right, then the QR. It is part of the input rather than an offset applied
 * afterwards, so two pieces of the same table are not turned in lockstep.
 */
export function pieceTilt(code: string, pieceIndex: number): number {
  const value = hash(code, pieceIndex)
  const magnitude = TILT_MIN_DEGREES + (value % TILT_STEP_COUNT) * TILT_STEP_DEGREES
  // A bit well away from the ones the magnitude consumed, so the sign is not
  // a function of the magnitude.
  const clockwise = ((value >>> 16) & 1) === 1
  return clockwise ? magnitude : -magnitude
}

/** The same angle as a CSS transform, ready for an element's inline style. */
export function tiltTransform(degrees: number): string {
  return `rotate(${degrees}deg)`
}
