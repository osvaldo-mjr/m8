import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PERSON_COLOR_COUNT, PERSON_COLOR_PROPERTY, seatColor } from './person-color.js'

describe('seatColor', () => {
  it('gives seat 1 the first colour', () => {
    expect(seatColor(1)).toBe('var(--m8-person-1)')
  })

  it('gives a different colour to each seat of a full table', () => {
    const colors = new Set<string>()
    for (let seat = 1; seat <= PERSON_COLOR_COUNT; seat += 1) colors.add(seatColor(seat))
    expect(colors.size).toBe(PERSON_COLOR_COUNT)
  })

  it('wraps round once the palette runs out rather than producing no colour', () => {
    expect(seatColor(PERSON_COLOR_COUNT + 1)).toBe(seatColor(1))
    expect(seatColor(PERSON_COLOR_COUNT + 4)).toBe(seatColor(4))
  })

  it('normalises a seat number below 1 instead of naming a property that does not exist', () => {
    expect(seatColor(0)).toBe(seatColor(PERSON_COLOR_COUNT))
    expect(seatColor(-1)).toBe(seatColor(PERSON_COLOR_COUNT - 1))
  })

  it('never writes a colour value, only the name of one', () => {
    for (let seat = 1; seat <= PERSON_COLOR_COUNT * 2; seat += 1) {
      expect(seatColor(seat)).not.toMatch(/#|rgb|hsl/)
    }
  })

  it('is unaffected by who is or is not sitting in the seat', () => {
    // The whole point of the move from arrival order to seat number: a seat's
    // colour is a pure function of its own number, so nothing about who
    // joined, left, or is about to sit down can change it.
    expect(seatColor(3)).toBe(seatColor(3))
  })
})

/**
 * The function above names custom properties; `tokens.css` defines them. Two
 * files, no compiler between them: a colour deleted from the stylesheet, or
 * a ninth seat added here, would leave a chip styled with a `var()` that
 * resolves to nothing — an invisible chip on a television, and nothing else
 * in the suite would notice.
 */
describe('the palette the stylesheet actually defines', () => {
  const stylesheet = readFileSync(
    fileURLToPath(new URL('../tokens.css', import.meta.url)),
    'utf8',
  )

  it.each(Array.from({ length: PERSON_COLOR_COUNT }, (_, index) => index + 1))(
    'defines the property seatColor(%i) points at',
    (seat) => {
      const property = seatColor(seat).replace(/^var\(|\)$/g, '')
      expect(stylesheet).toContain(`${property}:`)
    },
  )

  it('defines no more person colours than the palette claims to have', () => {
    const defined = stylesheet.match(/--m8-person-\d+\s*:/g) ?? []
    expect(defined).toHaveLength(PERSON_COLOR_COUNT)
  })

  it('leaves the per-seat property to be set by whoever is drawing a seat', () => {
    // `--m8-person` is written by the renderer onto one element at a time. A
    // global default here would mean an element that was never given a seat
    // still draws in somebody's colour.
    expect(stylesheet).not.toContain(`${PERSON_COLOR_PROPERTY}:`)
  })
})
