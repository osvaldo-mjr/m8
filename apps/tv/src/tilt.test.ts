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

/** Every neighbouring pair, across every sampled table. */
function everyNeighbouringPair(): [PiecePlacement, PiecePlacement][] {
  const pairs: [PiecePlacement, PiecePlacement][] = []
  for (const code of sampleCodes()) {
    const pieces = arrangement(code)
    for (let index = 1; index < pieces.length; index += 1) {
      const before = pieces[index - 1]
      const after = pieces[index]
      if (before !== undefined && after !== undefined) pairs.push([before, after])
    }
  }
  return pairs
}

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
 * The heart of this module, and the defect it was rewritten to fix.
 *
 * The first version drew every piece independently from a range of two to
 * four degrees. That is distinct on average and indistinguishable from three
 * metres, and the owner said so after looking at a real television: the codes
 * were all turned the same way. Widening the range alone would not have
 * fixed it — an independent draw from a wide range still puts two neighbours
 * a tenth of a degree apart often enough to be what somebody sees.
 *
 * So it is constructed. Each piece is chosen only from values far enough from
 * the one before it, and that is asserted here over every sampled table
 * rather than sampled and hoped for.
 */
describe('two pieces side by side', () => {
  it('are never turned within sight of the same angle', () => {
    for (const [before, after] of everyNeighbouringPair()) {
      expect(Math.abs(after.degrees - before.degrees)).toBeGreaterThanOrEqual(MIN_TILT_SEPARATION_DEGREES)
    }
  })

  it('never sit at the same height', () => {
    for (const [before, after] of everyNeighbouringPair()) {
      expect(Math.abs(after.liftSteps - before.liftSteps)).toBeGreaterThanOrEqual(MIN_LIFT_SEPARATION_STEPS)
    }
  })

  it('are never followed by two gaps of the same width', () => {
    for (const [before, after] of everyNeighbouringPair()) {
      expect(Math.abs(after.spaceSteps - before.spaceSteps)).toBeGreaterThanOrEqual(MIN_SPACE_SEPARATION_STEPS)
    }
  })

  it('finds the pairs it is meant to be checking', () => {
    // Guards the three assertions above: an empty list would pass them all.
    expect(everyNeighbouringPair().length).toBe(sampleCodes().length * (PIECE_COUNT - 1))
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
