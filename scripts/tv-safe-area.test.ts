import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { MAX_PARTICIPANTS } from '@m8/core'
import { describe, expect, it } from 'vitest'
import { stripCssComments } from './check-tv-css.mjs'
import {
  chipsPerRow,
  overscanPixels,
  peopleHeight,
  rowsNeeded,
  safeArea,
  stageHeight,
  tableHeight,
  tiltedExtent,
} from './tv-safe-area.js'

describe('the safe area', () => {
  it('takes the inset off both axes as a fraction of the width', () => {
    // A percentage padding resolves against the width on all four sides. At
    // 1920x1080 and 5% that is 96px everywhere, so the height loses 192px and
    // not 108px — the difference between fitting two rows of people and not.
    expect(safeArea({ width: 1920, height: 1080 }, 0.05)).toEqual({ width: 1728, height: 888 })
    expect(safeArea({ width: 1280, height: 720 }, 0.05)).toEqual({ width: 1152, height: 592 })
  })
})

describe('how the row of people wraps', () => {
  it('fits as many chips on a line as the cap allows, and no more', () => {
    expect(chipsPerRow(25)).toBe(4)
    expect(chipsPerRow(100)).toBe(1)
    expect(chipsPerRow(33)).toBe(3)
  })

  it.each([
    [0, 0],
    [1, 1],
    [4, 1],
    [5, 2],
    [8, 2],
    [9, 3],
  ])('puts %i people on %i line(s), four to a line', (participants, rows) => {
    expect(rowsNeeded(participants, 4)).toBe(rows)
  })

  it('counts the margin above each line, including the first', () => {
    // That margin is what separates the first line from the table as well as
    // one line from the next, so it is charged per line rather than between.
    expect(peopleHeight(2, 96, 44)).toBe(280)
  })
})

describe('a square lying on the table', () => {
  it('needs more room than its own size once it is turned', () => {
    expect(tiltedExtent(100, 0)).toBeCloseTo(100)
    expect(tiltedExtent(432, 4)).toBeCloseTo(461.1, 1)
  })

  it('does not care which way it was turned', () => {
    expect(tiltedExtent(432, -4)).toBeCloseTo(tiltedExtent(432, 4))
  })
})

describe('the stage', () => {
  const stage = {
    eyebrowHeight: 64,
    tableGap: 44,
    tableMinHeight: 461,
    peopleHeight: 280,
  }

  it('adds up to what it needs', () => {
    expect(stageHeight(stage)).toBe(849)
  })

  it('reports how far past the safe area it runs', () => {
    expect(overscanPixels(stage, 888)).toBe(-39)
    expect(overscanPixels(stage, 800)).toBe(49)
  })

  it('gives the table whatever is left', () => {
    expect(tableHeight(stage, 888)).toBe(500)
  })
})

/**
 * The sweep, as arithmetic.
 *
 * The defect this replaces was found by opening the page in a real browser
 * with eight people and sweeping nickname length: at nine characters the last
 * chip sat exactly on the safe line, at ten it was 72px into the overscan
 * margin at 1920x1080, and at sixteen — the length the product itself permits
 * — two chips were off the panel entirely. That was measured once, by eye,
 * and could not be measured again in CI.
 *
 * It is two claims now, and both are checked here:
 *
 *   1. No string anybody can type changes how many chips fit on a line. A
 *      chip is capped at a fraction of the row and everything inside it
 *      truncates, so the row's shape is a function of the number of people
 *      and nothing else. That is what the stylesheet assertions below pin.
 *   2. Given (1), the arithmetic closes at every count the product permits,
 *      at both resolutions the screen is designed for.
 *
 * The numbers come from the stylesheet itself rather than being restated, so
 * this fails when somebody changes a size rather than when somebody
 * remembers to update a test.
 *
 * What it still does not know is font metrics: whether `RECONNECTING` fits
 * the width it is given is a question for a browser, and it was answered in
 * one — see `docs/notes/visual-identity-report.md`. What makes that a
 * cosmetic question rather than a layout one is (1).
 */
describe('the screen at every number of people the table holds', () => {
  const repoRoot = fileURLToPath(new URL('..', import.meta.url))
  // Comments come out first, with the CSS guard's own function. Both files
  // explain themselves at length between their declarations, and a comment
  // sitting between two of them is enough to hide the second from a regular
  // expression looking for the start of a declaration.
  const styles = stripCssComments(readFileSync(`${repoRoot}apps/tv/src/styles.css`, 'utf8'))
  const tokens = stripCssComments(readFileSync(`${repoRoot}packages/tokens/tokens.css`, 'utf8'))
  const tilt = readFileSync(`${repoRoot}apps/tv/src/tilt.ts`, 'utf8')

  /** The body of a rule, by its exact selector. */
  function rule(css: string, selector: string): string {
    const match = new RegExp(`(?:^|[\\n}])\\s*${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`).exec(css)
    if (match === null || match[1] === undefined) throw new Error(`No rule for ${selector}`)
    return match[1]
  }

  function declaration(body: string, property: string): string {
    const match = new RegExp(`(?:^|[;{])\\s*${property}\\s*:\\s*([^;]+)`).exec(body)
    if (match === null || match[1] === undefined) throw new Error(`No ${property} declared`)
    return match[1].trim()
  }

  function pixels(body: string, property: string): number {
    return Number.parseFloat(declaration(body, property))
  }

  /**
   * The two tiers of sizes: the base `:root`, and the `:root` inside the
   * `min-width: 1600px` query that a 1920-wide screen also matches.
   */
  const roots = styles.split(':root').slice(1)
  const [base, large] = [roots[0] ?? '', roots[1] ?? '']

  const chipRule = rule(styles, '.m8-chip')
  const chipCapPercent = Number.parseFloat(declaration(chipRule, 'max-width'))
  const perRow = chipsPerRow(chipCapPercent)
  const insetRatio = Number.parseFloat(declaration(rule(tokens, ':root'), '--m8-safe-inset')) / 100

  // `TILT_MAX_DEGREES` in `apps/tv/src/tilt.ts`. Not imported: `apps/tv/src`
  // is deliberately typechecked only under its own project, with the
  // libraries a 2020 television has, and importing it here would pull it into
  // the root program as well. Asserted against the source instead, so the two
  // cannot drift silently.
  const maxTiltDegrees = 4
  it('agrees with the tilt module about the largest angle a piece is turned', () => {
    expect(tilt).toContain(`TILT_MAX_DEGREES = ${maxTiltDegrees}`)
  })

  const screens = [
    { name: '1280x720', screen: { width: 1280, height: 720 }, sizes: base },
    { name: '1920x1080', screen: { width: 1920, height: 1080 }, sizes: large },
  ]

  it('caps a chip at a quarter of the row, so the table holds two lines', () => {
    // Eight is what the table holds and two is what the screen has room for,
    // so four to a line is not a taste: it is the only cap that works.
    expect(perRow).toBe(4)
    expect(rowsNeeded(MAX_PARTICIPANTS, perRow)).toBe(2)
  })

  describe.each(screens)('at $name', ({ screen, sizes }) => {
    const safe = safeArea(screen, insetRatio)
    const qrOuter = pixels(sizes, '--m8-qr-size') + pixels(sizes, '--m8-qr-padding') * 2

    function stageFor(participants: number) {
      return {
        eyebrowHeight: pixels(sizes, '--m8-wordmark-type'),
        tableGap: pixels(sizes, '--m8-row-gap'),
        tableMinHeight: tiltedExtent(qrOuter, maxTiltDegrees),
        peopleHeight: peopleHeight(
          rowsNeeded(participants, perRow),
          pixels(sizes, '--m8-disc-size'),
          pixels(sizes, '--m8-row-gap'),
        ),
      }
    }

    const counts = Array.from({ length: MAX_PARTICIPANTS }, (_, index) => index + 1)

    it.each(counts)('keeps %i people inside the safe area', (participants) => {
      expect(overscanPixels(stageFor(participants), safe.height)).toBeLessThanOrEqual(0)
    })

    it('leaves the table room for the QR it carries, turned', () => {
      // The other half of the same squeeze: once the table had been pushed to
      // its content height, the QR's turned bounding box overhung the violet
      // surface — 15px at 1920, 9px at 1280.
      const room = tableHeight(stageFor(MAX_PARTICIPANTS), safe.height)
      expect(room).toBeGreaterThanOrEqual(tiltedExtent(qrOuter, maxTiltDegrees))
    })

    it('keeps the chip as tall as its disc even when somebody has dropped', () => {
      // If the name and the word under it were ever taller than the disc, a
      // line of people would grow when somebody's phone dropped, and the
      // arithmetic above — which charges one disc per line — would understate
      // the row at the exact moment the screen is under stress.
      const noteType = pixels(sizes, '--m8-chip-note-type')
      const stacked = pixels(sizes, '--m8-name-type') + noteType / 3 + noteType
      expect(stacked).toBeLessThan(pixels(sizes, '--m8-disc-size'))
    })

    it('is the arrangement that used to overflow, if the cap is removed', () => {
      // Guards the guard. Without a cap, eight sixteen-character nicknames
      // took three lines, and three lines do not fit at either resolution —
      // so the model must say so, or it is not measuring anything.
      const threeLines = {
        ...stageFor(MAX_PARTICIPANTS),
        peopleHeight: peopleHeight(3, pixels(sizes, '--m8-disc-size'), pixels(sizes, '--m8-row-gap')),
      }
      expect(overscanPixels(threeLines, safe.height)).toBeGreaterThan(0)
    })
  })

  /**
   * What makes the arithmetic above independent of what anybody typed. Each
   * of these is load bearing: drop any one and a long nickname widens the
   * chip again, four stop fitting on a line, and the row silently goes back
   * to three lines with every number in this file still adding up.
   */
  describe('the stylesheet facts the arithmetic rests on', () => {
    it('caps the chip and clips what will not fit', () => {
      expect(declaration(chipRule, 'max-width')).toBe(`${chipCapPercent}%`)
      expect(declaration(chipRule, 'overflow')).toBe('hidden')
      // The space between chips is inside the cap. Four chips of a quarter
      // each plus four margins is more than a line holds, and the fourth
      // would wrap.
      expect(declaration(chipRule, 'padding-right')).toBe('var(--m8-chip-gap)')
      expect(chipRule).not.toContain('margin-right')
    })

    it('lets the text inside the chip narrow rather than push it wider', () => {
      // A flex item's floor is its content unless it is told otherwise, so
      // without this the nickname refuses to shrink and the cap stops holding.
      expect(declaration(rule(styles, '.m8-chip-text'), 'min-width')).toBe('0')
    })

    it('only ever loosens the cap, and only below a full line', () => {
      // The relaxed caps exist so a table of two is not truncated with three
      // quarters of the row empty. They must not be able to undo the
      // guarantee: each one applies to a count that already fits on one line,
      // and none is narrower than the unconditional cap it sits on top of.
      const relaxed = [
        ...styles.matchAll(/\.m8-people\[data-abreast='(\d+)'\]\s*\.m8-chip\s*\{([^}]*)\}/g),
      ]
      expect(relaxed.length).toBeGreaterThan(0)
      for (const [, count, body] of relaxed) {
        const cap = Number.parseFloat(declaration(body ?? '', 'max-width'))
        expect(Number(count)).toBeLessThan(perRow)
        expect(cap).toBeGreaterThanOrEqual(chipCapPercent)
        expect(Number(count) * cap).toBeLessThanOrEqual(100)
      }
    })

    it.each(['.m8-chip-name', '.m8-chip-note'])('truncates %s rather than widening', (selector) => {
      const body = rule(styles, selector)
      expect(declaration(body, 'overflow')).toBe('hidden')
      expect(declaration(body, 'text-overflow')).toBe('ellipsis')
      expect(declaration(body, 'white-space')).toBe('nowrap')
    })
  })
})
