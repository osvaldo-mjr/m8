import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PERSON_COLOR_COUNT, PERSON_COLOR_PROPERTY, personColor } from './person-color.js'

describe('personColor', () => {
  it('gives the first arrival the first colour', () => {
    expect(personColor(0)).toBe('var(--m8-person-1)')
  })

  it('gives a different colour to each of a full table', () => {
    const colors = new Set<string>()
    for (let index = 0; index < PERSON_COLOR_COUNT; index += 1) colors.add(personColor(index))
    expect(colors.size).toBe(PERSON_COLOR_COUNT)
  })

  it('wraps round once the palette runs out rather than producing no colour', () => {
    expect(personColor(PERSON_COLOR_COUNT)).toBe(personColor(0))
    expect(personColor(PERSON_COLOR_COUNT + 3)).toBe(personColor(3))
  })

  it('normalises a negative index instead of naming a property that does not exist', () => {
    expect(personColor(-1)).toBe(personColor(PERSON_COLOR_COUNT - 1))
  })

  it('never writes a colour value, only the name of one', () => {
    for (let index = 0; index < PERSON_COLOR_COUNT * 2; index += 1) {
      expect(personColor(index)).not.toMatch(/#|rgb|hsl/)
    }
  })
})

/**
 * The function above names custom properties; `tokens.css` defines them. Two
 * files, no compiler between them: a colour deleted from the stylesheet, or
 * a ninth person added here, would leave a participant styled with a
 * `var()` that resolves to nothing — an invisible chip on a television, and
 * nothing else in the suite would notice.
 */
describe('the palette the stylesheet actually defines', () => {
  const stylesheet = readFileSync(
    fileURLToPath(new URL('../tokens.css', import.meta.url)),
    'utf8',
  )

  it.each(Array.from({ length: PERSON_COLOR_COUNT }, (_, index) => index))(
    'defines the property personColor(%i) points at',
    (index) => {
      const property = personColor(index).replace(/^var\(|\)$/g, '')
      expect(stylesheet).toContain(`${property}:`)
    },
  )

  it('defines no more person colours than the palette claims to have', () => {
    const defined = stylesheet.match(/--m8-person-\d+\s*:/g) ?? []
    expect(defined).toHaveLength(PERSON_COLOR_COUNT)
  })

  it('leaves the per-person property to be set by whoever is drawing a person', () => {
    // `--m8-person` is written by the renderer onto one element at a time. A
    // global default here would mean an element that was never given a
    // person still draws in somebody's colour.
    expect(stylesheet).not.toContain(`${PERSON_COLOR_PROPERTY}:`)
  })
})
