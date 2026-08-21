/**
 * How each thing lying on the table is placed: turned, lifted off the row's
 * baseline, and spaced from the piece beside it.
 *
 * A real table does not have its contents squared up. The four code tiles and
 * the QR are each turned a little, lifted a little, and separated by gaps
 * that are not all the same width, which is what makes them read as objects
 * put down on a surface rather than as boxes in a layout. The table itself
 * and the row of people stay rigid: the contrast is what sells it, and
 * counting the people around the table is a real glance-task that a tilted
 * row would cost.
 *
 * Four properties this has to have, and the reason for each:
 *
 *   - Wide enough to see. The first version turned every piece by two to four
 *     degrees, which is mathematically distinct and visually indistinguishable
 *     from three metres: the owner looked at a real television and said the
 *     codes were all turned the same way. An isolated tile carrying one
 *     character tolerates far more rotation than a line of running text does,
 *     so the range is now three to eight degrees.
 *   - More than one axis. Rotation alone is not scatter. Things genuinely
 *     dropped on a table also sit at different heights and are not evenly
 *     spaced, so each piece also carries a vertical lift and the gap after it
 *     varies. Both are expressed in steps rather than pixels, so the length of
 *     a step stays in the stylesheet where the two screen sizes are declared.
 *   - Neighbours visibly different. Distinctness on average is exactly what
 *     produced the defect above, so it is constructed rather than hoped for:
 *     each piece is chosen from only those values far enough from the piece
 *     before it. See `apart` below.
 *   - Stable. Derived from the table code, so the same table always arranges
 *     itself the same way and two rooms do not see the same picture. Random
 *     per render would make every piece twitch each time anybody joined or
 *     renamed, because a `tableState` arrives on each of those and the screen
 *     redraws.
 *
 * Which is a hash, and nothing else: no state, no storage, no clock.
 *
 * The angles are bounded by more than taste. The QR is the largest thing on
 * the table and a turned square needs more room than a square, so the tilt
 * range and the lift range are both charged against the table's inner height
 * — see `scripts/tv-safe-area.ts`, which proves the arrangement fits at both
 * resolutions rather than leaving it to the eye.
 */

/** The smallest turn a piece is given. Zero would look like a mistake. */
export const TILT_MIN_DEGREES = 3

/** The largest. A single character stays comfortable to read well past this. */
export const TILT_MAX_DEGREES = 8

/** Steps of half a degree between the two, inclusive. */
const TILT_STEP_DEGREES = 0.5

/**
 * How far apart two neighbouring pieces must be turned.
 *
 * Three degrees is the smallest difference that survives being looked at from
 * the sofa. Below it two pieces read as turned the same way, which is the
 * whole complaint this range was widened to answer — so it is enforced
 * between neighbours rather than left to the spread of the hash.
 */
export const MIN_TILT_SEPARATION_DEGREES = 3

/** How far up or down a piece may sit, in steps of `--m8-scatter-step`. */
export const MAX_LIFT_STEPS = 3

/** And how many steps apart two neighbours must sit. */
export const MIN_LIFT_SEPARATION_STEPS = 2

/** How much may be added to the gap after a piece, in the same steps. */
export const MAX_SPACE_STEPS = 3

/** Two neighbouring gaps are never the same width. */
export const MIN_SPACE_SEPARATION_STEPS = 1

/**
 * The lengths a step stands for, named rather than written.
 *
 * The two screen sizes are declared in `apps/tv/src/styles.css` and nothing
 * here knows which one is in force, so a lift is emitted as a multiple of a
 * custom property and the stylesheet resolves it. The QR has its own, smaller
 * step: it is the piece whose turned bounding box sets the least height the
 * table can be drawn in, and it lies alone rather than in a row, so a large
 * lift on it would cost the row of people real space and buy nothing the room
 * can see.
 */
export const SCATTER_STEP_PROPERTY = '--m8-scatter-step'
export const QR_SCATTER_STEP_PROPERTY = '--m8-qr-scatter-step'

/** The gap a piece has after it before any extra steps are added. */
export const PIECE_GAP_PROPERTY = '--m8-piece-gap'

/** Where one piece lies, in units the stylesheet turns into lengths. */
export interface PiecePlacement {
  /** Degrees, negative or positive, never zero. */
  readonly degrees: number
  /** Up (negative) or down (positive) off the row's baseline, in steps. */
  readonly liftSteps: number
  /** Extra width of the gap *after* this piece, in steps. Never negative. */
  readonly spaceSteps: number
}

/** Every angle a piece may be turned by, both directions. */
function buildAngles(): number[] {
  const angles: number[] = []
  for (
    let magnitude = TILT_MIN_DEGREES;
    magnitude <= TILT_MAX_DEGREES + TILT_STEP_DEGREES / 2;
    magnitude += TILT_STEP_DEGREES
  ) {
    angles.push(magnitude)
    angles.push(-magnitude)
  }
  return angles
}

/** Every height a piece may sit at, in steps. */
function buildLifts(): number[] {
  const lifts: number[] = []
  for (let steps = -MAX_LIFT_STEPS; steps <= MAX_LIFT_STEPS; steps += 1) lifts.push(steps)
  return lifts
}

/** Every width a gap may be widened by, in steps. */
function buildSpaces(): number[] {
  const spaces: number[] = []
  for (let steps = 0; steps <= MAX_SPACE_STEPS; steps += 1) spaces.push(steps)
  return spaces
}

const ANGLES = buildAngles()
const LIFTS = buildLifts()
const SPACES = buildSpaces()

/** Which of the three things about a piece is being drawn from the hash. */
const ANGLE_FIELD = 0
const LIFT_FIELD = 1
const SPACE_FIELD = 2

/**
 * FNV-1a over the code, the piece's position and which field is being asked
 * for, in 32-bit integer arithmetic throughout, finished with murmur3's
 * avalanche step.
 *
 * `Math.imul` rather than `*`: the multiply overflows the range JavaScript
 * numbers hold exactly, and a plain multiplication would silently lose the
 * low bits that are the whole point of the mix.
 *
 * The avalanche is not decoration. The pieces of one table differ only in the
 * last things folded in, so without it the hashes of a table differ in a
 * handful of low bits and the arrangement of the whole table collapses onto a
 * few shapes: measured over nine hundred codes, plain FNV-1a produced 131
 * distinct arrangements where the finished hash produces 897.
 */
function hash(code: string, pieceIndex: number, field: number): number {
  let value = 0x811c9dc5
  for (let i = 0; i < code.length; i += 1) {
    value ^= code.charCodeAt(i)
    value = Math.imul(value, 0x01000193) >>> 0
  }
  value ^= pieceIndex + 1
  value = Math.imul(value, 0x01000193) >>> 0
  value ^= field + 1
  value = Math.imul(value, 0x01000193) >>> 0

  value ^= value >>> 16
  value = Math.imul(value, 0x85ebca6b) >>> 0
  value ^= value >>> 13
  value = Math.imul(value, 0xc2b2ae35) >>> 0
  value ^= value >>> 16
  return value >>> 0
}

/**
 * The values far enough from what the piece before was given.
 *
 * This is where "scattered" is constructed rather than hoped for. Drawing
 * each piece independently from a wide range gives neighbours that differ *on
 * average*, which is precisely the arrangement that shipped and looked like a
 * row of pieces all turned the same way: the average is not what anybody
 * sees.
 *
 * Every range here is wide enough that something always survives the filter —
 * an angle keeps at least fifteen of twenty-two, a lift at least four of
 * seven, a gap at least three of four — and `tilt.test.ts` asserts the separation
 * actually holds over nine hundred codes rather than trusting that. The empty
 * case falls back to the whole range so that a range narrowed later fails as
 * a slightly duller table rather than as a blank screen on the one thing the
 * room is looking at.
 */
function apart(values: readonly number[], previous: number | null, minimum: number): readonly number[] {
  if (previous === null) return values
  const neighbour = previous
  const kept = values.filter((value) => Math.abs(value - neighbour) >= minimum)
  return kept.length > 0 ? kept : values
}

function pick(values: readonly number[], code: string, pieceIndex: number, field: number): number {
  const chosen = values[hash(code, pieceIndex, field) % values.length]
  // Unreachable: `values` is never empty. Written so this returns a number
  // rather than `number | undefined` under `noUncheckedIndexedAccess`.
  return chosen === undefined ? 0 : chosen
}

/**
 * Where every piece of one table lies, left to right: the code tiles, then
 * the QR.
 *
 * A whole-table function rather than one call per piece, because the
 * guarantee this exists for is about *neighbours*: a piece cannot be placed
 * without knowing what was placed beside it.
 */
export function arrangePieces(code: string, pieceCount: number): PiecePlacement[] {
  const placements: PiecePlacement[] = []
  let previous: PiecePlacement | null = null
  for (let index = 0; index < pieceCount; index += 1) {
    const placement: PiecePlacement = {
      degrees: pick(
        apart(ANGLES, previous === null ? null : previous.degrees, MIN_TILT_SEPARATION_DEGREES),
        code,
        index,
        ANGLE_FIELD,
      ),
      liftSteps: pick(
        apart(LIFTS, previous === null ? null : previous.liftSteps, MIN_LIFT_SEPARATION_STEPS),
        code,
        index,
        LIFT_FIELD,
      ),
      spaceSteps: pick(
        apart(SPACES, previous === null ? null : previous.spaceSteps, MIN_SPACE_SEPARATION_STEPS),
        code,
        index,
        SPACE_FIELD,
      ),
    }
    placements.push(placement)
    previous = placement
  }
  return placements
}

/**
 * One placement as a CSS transform, ready for an element's inline style.
 *
 * The order is load bearing. Transforms apply right to left, so the piece is
 * turned first and then moved in the table's own axes; written the other way
 * round a lifted piece would also drift sideways by the sine of its angle.
 *
 * `calc()` is Chromium 26 and is already used elsewhere in this screen's
 * stylesheet, so a length expressed as a multiple of a custom property is
 * safe on the oldest set in the target range.
 */
export function pieceTransform(placement: PiecePlacement, stepProperty: string): string {
  return `translateY(calc(var(${stepProperty}) * ${placement.liftSteps})) rotate(${placement.degrees}deg)`
}

/** The gap after one piece, as a CSS length for `margin-right`. */
export function pieceSpacing(placement: PiecePlacement, stepProperty: string): string {
  return `calc(var(${PIECE_GAP_PROPERTY}) + var(${stepProperty}) * ${placement.spaceSteps})`
}
