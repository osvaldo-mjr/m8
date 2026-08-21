import { describe, expect, it } from 'vitest'
import {
  MAX_LIFT_STEPS,
  MAX_SPACE_STEPS,
  MIN_LIFT_SEPARATION_STEPS,
  MIN_SPACE_SEPARATION_STEPS,
  MIN_TILT_SEPARATION_DEGREES,
  TILT_MAX_DEGREES,
  TILT_MIN_DEGREES,
  arrangePieces,
  pieceSpacing,
  pieceTransform,
} from './tilt.js'
import type { PiecePlacement } from './tilt.js'

/** Four code tiles, then the QR. */
const PIECE_COUNT = 5

/** Just the tiles. They are the row that shares a baseline and a rhythm. */
const TILE_COUNT = 4

/** Every four-character code this repository can issue, near enough. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789'
function sampleCodes(): string[] {
  const codes: string[] = []
  for (let a = 0; a < ALPHABET.length; a += 1) {
    for (let b = 0; b < ALPHABET.length; b += 1) {
      codes.push(`A${ALPHABET[a]}${ALPHABET[b]}${ALPHABET[(a + b) % ALPHABET.length]}`)
    }
  }
  return codes
}

function arrangement(code: string): PiecePlacement[] {
  return arrangePieces(code, PIECE_COUNT)
}

/** An arrangement as one comparable string, for counting distinct tables. */
function shape(code: string): string {
  return arrangement(code)
    .map((piece) => `${piece.degrees}/${piece.liftSteps}/${piece.spaceSteps}`)
    .join(',')
}

/**
 * Every placement of every sampled table. Written as loops rather than with
 * `flatMap`, which is ES2019: this project is typechecked against the
 * libraries a 2020 television has, and that includes its own tests.
 */
function everyPlacement(): PiecePlacement[] {
  const placements: PiecePlacement[] = []
  for (const code of sampleCodes()) {
    for (const piece of arrangement(code)) placements.push(piece)
  }
  return placements
}

/**
 * Every arrangement the alphabet can produce, reduced to counters.
 *
 * 810,000 codes, computed once and shared by every assertion below, because
 * the questions that matter here are about the *distribution* and a sample of
 * nine hundred structured codes cannot answer them. It takes roughly a
 * second — measured at 978-1036ms across three runs, of which the
 * `arrangePieces` calls alone are 719-757ms — which is the price of the one
 * guard in this repository that can tell a scattered arrangement from a
 * patterned one.
 *
 * The worst pair of each kind is kept, not just the minimum, so a failure
 * says which arrangement broke the rule rather than only that one did.
 */
interface Survey {
  readonly codes: number
  readonly pairs: number
  readonly smallestAngularGap: number
  readonly smallestLiftGap: number
  readonly smallestSpaceGap: number
  readonly worstAngularPair: string
  /** Neighbouring tiles leaning opposite ways, as a fraction of all pairs. */
  readonly oppositeLean: number
  /** Tables whose four tiles lean left-right-left-right, or the mirror. */
  readonly allAlternating: number
  /** Tables where the lean alternates and the height alternates with it. */
  readonly leanAndLiftAlternating: number
  /** Tables whose four heights are two values in an ABAB order. */
  readonly liftAbab: number
  /** Tables whose four magnitudes run high-low-high-low, either way up. */
  readonly magnitudeZigzag: number
}

function survey(): Survey {
  let codes = 0
  let pairs = 0
  let opposite = 0
  let allAlternating = 0
  let leanAndLift = 0
  let liftAbab = 0
  let magnitudeZigzag = 0
  let smallestAngularGap = Number.POSITIVE_INFINITY
  let smallestLiftGap = Number.POSITIVE_INFINITY
  let smallestSpaceGap = Number.POSITIVE_INFINITY
  let worstAngularPair = ''

  for (const a of ALPHABET) {
    for (const b of ALPHABET) {
      for (const c of ALPHABET) {
        for (const d of ALPHABET) {
          const code = `${a}${b}${c}${d}`
          const pieces = arrangement(code)
          codes += 1

          let alternating = true
          for (let index = 1; index < pieces.length; index += 1) {
            const before = pieces[index - 1]
            const after = pieces[index]
            if (before === undefined || after === undefined) continue
            pairs += 1
            const angularGap = Math.abs(after.degrees - before.degrees)
            if (angularGap < smallestAngularGap) {
              smallestAngularGap = angularGap
              worstAngularPair = `${code}: ${before.degrees} then ${after.degrees}`
            }
            smallestLiftGap = Math.min(smallestLiftGap, Math.abs(after.liftSteps - before.liftSteps))
            smallestSpaceGap = Math.min(smallestSpaceGap, Math.abs(after.spaceSteps - before.spaceSteps))
            if (index >= TILE_COUNT) continue
            if (Math.sign(after.degrees) !== Math.sign(before.degrees)) opposite += 1
            else alternating = false
          }

          const tiles = pieces.slice(0, TILE_COUNT)
          const lifts = tiles.map((piece) => piece.liftSteps)
          const magnitudes = tiles.map((piece) => Math.abs(piece.degrees))
          if (alternating) allAlternating += 1
          if (alternating && zigzags(lifts)) leanAndLift += 1
          if (abab(lifts)) liftAbab += 1
          if (zigzags(magnitudes)) magnitudeZigzag += 1
        }
      }
    }
  }

  const tilePairs = codes * (TILE_COUNT - 1)
  return {
    codes,
    pairs,
    smallestAngularGap,
    smallestLiftGap,
    smallestSpaceGap,
    worstAngularPair,
    oppositeLean: opposite / tilePairs,
    allAlternating: allAlternating / codes,
    leanAndLiftAlternating: leanAndLift / codes,
    liftAbab: liftAbab / codes,
    magnitudeZigzag: magnitudeZigzag / codes,
  }
}

/** Four values running up-down-up or down-up-down, with no two equal in a row. */
function zigzags(values: readonly number[]): boolean {
  const first = Math.sign((values[1] ?? 0) - (values[0] ?? 0))
  const second = Math.sign((values[2] ?? 0) - (values[1] ?? 0))
  const third = Math.sign((values[3] ?? 0) - (values[2] ?? 0))
  return first !== 0 && first === -second && second === -third
}

/** Four values that are only two values, in an ABAB order. */
function abab(values: readonly number[]): boolean {
  return values[0] === values[2] && values[1] === values[3] && values[0] !== values[1]
}

const percent = (fraction: number): string => `${(fraction * 100).toFixed(1)}%`

describe('how far each piece is turned', () => {
  it('stays inside the range a single character is comfortable at', () => {
    for (const piece of everyPlacement()) {
      expect(Math.abs(piece.degrees)).toBeGreaterThanOrEqual(TILT_MIN_DEGREES)
      expect(Math.abs(piece.degrees)).toBeLessThanOrEqual(TILT_MAX_DEGREES)
    }
  })

  it('never leaves a piece square, which would read as a mistake', () => {
    for (const piece of everyPlacement()) expect(piece.degrees).not.toBe(0)
  })

  it('turns pieces both clockwise and anticlockwise', () => {
    const placements = everyPlacement()
    expect(placements.some((piece) => piece.degrees > 0)).toBe(true)
    expect(placements.some((piece) => piece.degrees < 0)).toBe(true)
  })

  it('uses every magnitude in the range rather than favouring one', () => {
    const magnitudes = new Set(everyPlacement().map((piece) => Math.abs(piece.degrees)))
    expect(magnitudes.size).toBe((TILT_MAX_DEGREES - TILT_MIN_DEGREES) / 0.5 + 1)
    expect(magnitudes.has(TILT_MIN_DEGREES)).toBe(true)
    expect(magnitudes.has(TILT_MAX_DEGREES)).toBe(true)
  })
})

describe('where each piece sits, and how far apart', () => {
  it('lifts pieces off a shared baseline, in whole steps within range', () => {
    // Rotation alone is not scatter: things genuinely dropped on a table do
    // not line up along one edge. The lift is what breaks that line.
    for (const piece of everyPlacement()) {
      expect(Number.isInteger(piece.liftSteps)).toBe(true)
      expect(Math.abs(piece.liftSteps)).toBeLessThanOrEqual(MAX_LIFT_STEPS)
    }
  })

  it('varies the gap after a piece, in whole steps, never narrowing it', () => {
    // A negative step would take the gap below what the stylesheet declares,
    // and that floor is what keeps two turned tiles from touching.
    for (const piece of everyPlacement()) {
      expect(Number.isInteger(piece.spaceSteps)).toBe(true)
      expect(piece.spaceSteps).toBeGreaterThanOrEqual(0)
      expect(piece.spaceSteps).toBeLessThanOrEqual(MAX_SPACE_STEPS)
    }
  })

  it('uses every height and every gap width available', () => {
    const placements = everyPlacement()
    const lifts = new Set(placements.map((piece) => piece.liftSteps))
    const spaces = new Set(placements.map((piece) => piece.spaceSteps))
    expect(lifts.size).toBe(MAX_LIFT_STEPS * 2 + 1)
    expect(spaces.size).toBe(MAX_SPACE_STEPS + 1)
  })
})

/**
 * The heart of this module, and the two defects it has now been rewritten to
 * fix — the second of which was the first fix's own mirror image.
 *
 * **The original.** Every piece was drawn independently from a range of two
 * to four degrees. That is distinct on average and indistinguishable from
 * three metres, and the owner said so after looking at a real television: the
 * codes were all turned the same way. Widening the range alone would not have
 * fixed it, because an independent draw from a wide range still puts two
 * neighbours a tenth of a degree apart often enough to be what somebody sees.
 * So a minimum separation between neighbours is enforced.
 *
 * **The repair's own defect.** Enforcing that separation on the *signed*
 * angle made flipping the lean the cheapest way to satisfy it — every
 * opposite-leaning angle clears three degrees for free, at most five
 * same-leaning ones ever do. Four pairs in five flipped, and over half of all
 * tables came out a perfect herringbone. That is a pattern too, and the eye
 * reads a pattern as arranged rather than as scattered. The lean is now drawn
 * on its own, as a coin.
 *
 * Both defects are invisible to a minimum-separation assertion, which a
 * herringbone satisfies by construction. So the guard is statistical, and it
 * sweeps the whole code space rather than a sample: these are questions about
 * a distribution, and the answer has to be the same number CI sees and a
 * report quotes.
 */
describe('every arrangement the alphabet can produce', () => {
  const measured = survey()

  it('sweeps the whole code space, not a corner of it', () => {
    // Guards every assertion below: a survey of nothing passes them all.
    expect(measured.codes).toBe(ALPHABET.length ** 4)
    expect(measured.pairs).toBe(measured.codes * (PIECE_COUNT - 1))
  })

  describe('two pieces side by side', () => {
    it('are never turned within sight of the same angle', () => {
      // Degrees of *actual* rotation, so this forbids +3 beside +3.5 and
      // allows +8 beside -8. Written on magnitudes alone it would get both
      // of those backwards.
      expect(measured.smallestAngularGap, measured.worstAngularPair).toBeGreaterThanOrEqual(
        MIN_TILT_SEPARATION_DEGREES,
      )
    })

    it('never sit at the same height', () => {
      expect(measured.smallestLiftGap).toBeGreaterThanOrEqual(MIN_LIFT_SEPARATION_STEPS)
    })

    it('are never followed by two gaps of the same width', () => {
      expect(measured.smallestSpaceGap).toBeGreaterThanOrEqual(MIN_SPACE_SEPARATION_STEPS)
    })
  })

  /**
   * The ceilings below are not round numbers pulled out of the air: each sits
   * a little above what the mechanism measures today, and far below what the
   * defect it replaced measured. The figures are in
   * `docs/notes/visual-identity-report.md`; the ones that matter are that the
   * lean used to flip on 80.5% of pairs and now flips on 53.1%, against 50%
   * for a fair coin, and that 53.6% of tables used to alternate outright
   * where 16.2% do now, against 12.5% for a fair coin.
   */
  describe('and does not settle into a pattern', () => {
    it('does not flip the lean between neighbours too often', () => {
      expect(measured.oppositeLean, percent(measured.oppositeLean)).toBeLessThan(0.58)
    })

    it('does not lean the same way too often either', () => {
      // The other mirror, and the owner's original complaint: a mechanism
      // that favoured keeping the lean would put every code back on one
      // diagonal. A fair coin sits at 50%; this catches a swing either way.
      expect(measured.oppositeLean, percent(measured.oppositeLean)).toBeGreaterThan(0.45)
    })

    it('rarely comes out as a full left-right-left-right herringbone', () => {
      expect(measured.allAlternating, percent(measured.allAlternating)).toBeLessThan(0.2)
    })

    it('rarely alternates in lean and in height at once', () => {
      // The most legible pattern of the lot: lean left and high, lean right
      // and low, repeat. It was 36.3% of all tables before this fix.
      expect(measured.leanAndLiftAlternating, percent(measured.leanAndLiftAlternating)).toBeLessThan(0.15)
    })

    it('rarely draws the four heights from only two values', () => {
      // Measured at 17.6% while the lift range held five values, which is
      // what a zigzag looks like as a number. Seven values put it at 5.5%.
      expect(measured.liftAbab, percent(measured.liftAbab)).toBeLessThan(0.08)
    })

    it('does not make the magnitudes bounce between the extremes', () => {
      // The residual the alternative fix would have traded for: a rule
      // written on magnitudes rather than on rotation forces every
      // neighbour far along a bounded range, and the four magnitudes then
      // run high-low-high-low on 95.5% of tables. Four independent values
      // zigzag 41.7% of the time; this mechanism measures 58.8%.
      expect(measured.magnitudeZigzag, percent(measured.magnitudeZigzag)).toBeLessThan(0.7)
    })
  })
})

describe('the arrangement as a whole', () => {
  it('gives the same table the same arrangement every time it is asked', () => {
    // This is the whole reason it is a hash. A `tableState` arrives every
    // time anyone joins or renames, and the screen redraws on each one: an
    // arrangement that were random per render would make every piece on the
    // table twitch whenever anybody touched their phone.
    expect(arrangement('KXTP')).toEqual(arrangement('KXTP'))
    expect(arrangement('KXTP')).toEqual(arrangement('KXTP'))
  })

  it('rearranges the table when a single character of the code changes', () => {
    expect(arrangement('KXTP')).not.toEqual(arrangement('KXTQ'))
    expect(arrangement('KXTP')).not.toEqual(arrangement('KXSP'))
    expect(arrangement('KXTP')).not.toEqual(arrangement('KWTP'))
    expect(arrangement('KXTP')).not.toEqual(arrangement('MXTP'))
  })

  it('arranges tables differently from one another', () => {
    // Not "no two tables can ever coincide": the space of arrangements is
    // finite and this repository can issue twenty-seven thousand codes, so
    // two rooms landing on the same picture is arithmetic, not a defect.
    // What matters is that the arrangement is a function of the code and
    // spreads across the space rather than favouring a handful of pictures.
    const codes = sampleCodes()
    const distinct = new Set(codes.map(shape))
    expect(distinct.size).toBeGreaterThan(codes.length * 0.9)
  })

  it('does not turn every piece of a table the same way', () => {
    // Otherwise the table reads as one rotated block, not as things put down
    // separately. Guaranteed by the neighbour rule above; asserted here
    // because it is the property somebody in the room actually sees.
    const distinct = new Set(arrangement('KXTP').map((piece) => piece.degrees))
    expect(distinct.size).toBeGreaterThan(1)
  })
})

describe('what the stylesheet is handed', () => {
  const placement = { degrees: -6.5, liftSteps: 2, spaceSteps: 1 }

  it('turns the piece first and then moves it, in that order', () => {
    // Transforms apply right to left. Written the other way round, a lifted
    // piece would also drift sideways by the sine of its own angle.
    expect(pieceTransform(placement, '--m8-scatter-step')).toBe(
      'translateY(calc(var(--m8-scatter-step) * 2)) rotate(-6.5deg)',
    )
  })

  it('names the step rather than writing a length, so the tiers stay in the stylesheet', () => {
    // The television has two size tiers and this module cannot know which is
    // in force, so a lift is a multiple of a custom property.
    expect(pieceTransform(placement, '--m8-qr-scatter-step')).toContain('var(--m8-qr-scatter-step)')
  })

  it('writes a gap as the declared one plus however many steps', () => {
    expect(pieceSpacing(placement, '--m8-scatter-step')).toBe(
      'calc(var(--m8-piece-gap) + var(--m8-scatter-step) * 1)',
    )
  })

  it('leaves a piece with no lift at zero rather than nudging it', () => {
    expect(pieceTransform({ degrees: 3, liftSteps: 0, spaceSteps: 0 }, '--m8-scatter-step')).toBe(
      'translateY(calc(var(--m8-scatter-step) * 0)) rotate(3deg)',
    )
  })
})
