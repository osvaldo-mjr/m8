import { describe, expect, it } from 'vitest'
import { TILT_MAX_DEGREES, TILT_MIN_DEGREES, pieceTilt, tiltTransform } from './tilt.js'

const PIECES = [0, 1, 2, 3, 4]

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

function arrangement(code: string): number[] {
  return PIECES.map((piece) => pieceTilt(code, piece))
}

/**
 * Every angle of every sampled table. Written as a loop rather than with
 * `flatMap`, which is ES2019: this project is typechecked against the
 * libraries a 2020 television has, and that includes its own tests.
 */
function everyAngle(): number[] {
  const angles: number[] = []
  for (const code of sampleCodes()) {
    for (const angle of arrangement(code)) angles.push(angle)
  }
  return angles
}

describe('pieceTilt', () => {
  it('turns every piece by an angle the code stays readable at', () => {
    for (const code of sampleCodes()) {
      for (const angle of arrangement(code)) {
        expect(Math.abs(angle)).toBeGreaterThanOrEqual(TILT_MIN_DEGREES)
        expect(Math.abs(angle)).toBeLessThanOrEqual(TILT_MAX_DEGREES)
      }
    }
  })

  it('never leaves a piece square, which would read as a mistake', () => {
    for (const code of sampleCodes()) {
      for (const angle of arrangement(code)) expect(angle).not.toBe(0)
    }
  })

  it('gives the same table the same arrangement every time it is asked', () => {
    // This is the whole reason it is a hash. A `tableState` arrives every
    // time anyone joins or renames, and the screen redraws on each one: an
    // angle that were random per render would make every piece on the table
    // twitch whenever anybody touched their phone.
    expect(arrangement('KXTP')).toEqual(arrangement('KXTP'))
    expect(arrangement('KXTP')).toEqual(arrangement('KXTP'))
  })

  it('arranges tables differently from one another', () => {
    // Not "no two tables can ever coincide": five pieces with ten angles
    // each is a hundred thousand arrangements, and this repository can issue
    // twenty-seven thousand codes, so two tables in two different rooms
    // landing on the same picture is arithmetic, not a defect. What matters
    // is that the arrangement is a function of the code and spreads across
    // the space rather than favouring a handful of pictures.
    const codes = sampleCodes()
    const distinct = new Set(codes.map((code) => arrangement(code).join(',')))
    expect(distinct.size).toBeGreaterThan(codes.length * 0.9)
  })

  it('rearranges the table when a single character of the code changes', () => {
    expect(arrangement('KXTP')).not.toEqual(arrangement('KXTQ'))
    expect(arrangement('KXTP')).not.toEqual(arrangement('KXSP'))
    expect(arrangement('KXTP')).not.toEqual(arrangement('KWTP'))
    expect(arrangement('KXTP')).not.toEqual(arrangement('MXTP'))
  })

  it('does not turn every piece of a table the same way', () => {
    // Otherwise the table reads as one rotated block, not as things put down
    // separately.
    const distinct = new Set(arrangement('KXTP'))
    expect(distinct.size).toBeGreaterThan(1)
  })

  it('turns pieces both clockwise and anticlockwise across a table', () => {
    const angles = everyAngle()
    expect(angles.some((angle) => angle > 0)).toBe(true)
    expect(angles.some((angle) => angle < 0)).toBe(true)
  })

  it('uses the whole range of angles rather than favouring one', () => {
    expect(new Set(everyAngle().map(Math.abs))).toEqual(new Set([2, 2.5, 3, 3.5, 4]))
  })
})

describe('tiltTransform', () => {
  it('writes an angle as a CSS rotation', () => {
    expect(tiltTransform(2.5)).toBe('rotate(2.5deg)')
    expect(tiltTransform(-4)).toBe('rotate(-4deg)')
  })
})
