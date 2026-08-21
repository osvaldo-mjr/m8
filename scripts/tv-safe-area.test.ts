import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { MAX_PARTICIPANTS } from '@m8/core'
import { describe, expect, it } from 'vitest'
import { stripCssComments } from './check-tv-css.mjs'
import {
  chipsPerRow,
  overscanPixels,
  peopleHeight,
  rowExtent,
  rowsNeeded,
  safeArea,
  scatteredExtent,
  stageHeight,
  surfaceContentHeight,
  surfaceHeight,
  tableHeight,
  tiltOverhang,
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

  it('throws the same corner out on each side', () => {
    expect(tiltOverhang(100, 0)).toBeCloseTo(0)
    expect(tiltOverhang(224, 8)).toBeCloseTo((tiltedExtent(224, 8) - 224) / 2)
  })

  it('costs twice what a lift moves it, because it may go either way', () => {
    expect(scatteredExtent(224, 8, 0)).toBeCloseTo(tiltedExtent(224, 8))
    expect(scatteredExtent(224, 8, 28)).toBeCloseTo(tiltedExtent(224, 8) + 56)
    expect(scatteredExtent(224, 8, -28)).toBeCloseTo(scatteredExtent(224, 8, 28))
  })
})

describe('the table as a slab', () => {
  it('keeps the band along its lower edge out of what lies on it', () => {
    expect(surfaceContentHeight(500, 22)).toBe(478)
    expect(surfaceHeight(478, 22)).toBe(500)
  })
})

describe('a row of pieces on the table', () => {
  it('is as wide as the boxes, the gaps, and the corners the ends throw out', () => {
    // A transform does not change what a flex row measures, so the layout is
    // the untilted boxes and the gaps; the tilt only adds a corner at each
    // end. Four 224px tiles with three 30px gaps is 986px squared up.
    expect(rowExtent([224, 224, 224, 224], [30, 30, 30], 0)).toBeCloseTo(986)
    expect(rowExtent([224, 224, 224, 224], [30, 30, 30], 8)).toBeCloseTo(986 + tiltOverhang(224, 8) * 2)
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
   * The percentage a cap is written against, whether the declaration is a
   * bare `25%` or, as `.m8-chip`'s is, `calc(25% - 1px)` — the 1px is a
   * sub-pixel-rounding safety margin invisible to this model, which reasons
   * in exact percentages of the row.
   */
  function percent(body: string, property: string): number {
    const value = declaration(body, property)
    const match = /(\d+(?:\.\d+)?)%/.exec(value)
    if (match === null || match[1] === undefined) throw new Error(`No percentage in ${property}: ${value}`)
    return Number.parseFloat(match[1])
  }

  /**
   * The two tiers of sizes: the base `:root`, and the `:root` inside the
   * `min-width: 1600px` query that a 1920-wide screen also matches.
   */
  const roots = styles.split(':root').slice(1)
  const [base, large] = [roots[0] ?? '', roots[1] ?? '']

  const chipRule = rule(styles, '.m8-chip')
  const chipCapPercent = percent(chipRule, 'max-width')
  const perRow = chipsPerRow(chipCapPercent)
  const insetRatio = Number.parseFloat(declaration(rule(tokens, ':root'), '--m8-safe-inset')) / 100

  /*
   * The scatter, as `apps/tv/src/tilt.ts` declares it. Not imported:
   * `apps/tv/src` is deliberately typechecked only under its own project,
   * with the libraries a 2020 television has, and importing it here would
   * pull it into the root program as well. Asserted against the source
   * instead, so the two cannot drift silently — and every one of these is
   * load bearing now rather than only the angle: a lift costs the table
   * height and a wider gap costs it width.
   */
  const minTiltDegrees = 3
  const maxTiltDegrees = 8
  const maxLiftSteps = 3
  const maxSpaceSteps = 3
  it.each([
    ['TILT_MIN_DEGREES', minTiltDegrees],
    ['TILT_MAX_DEGREES', maxTiltDegrees],
    ['MAX_LIFT_STEPS', maxLiftSteps],
    ['MAX_SPACE_STEPS', maxSpaceSteps],
  ])('agrees with the tilt module about %s', (name, value) => {
    expect(tilt).toContain(`${name} = ${value}`)
  })

  /**
   * Every magnitude the tilt can take, in half-degree steps. The extent of a
   * turned square grows with the angle over this whole range, so the largest
   * is always the worst case — but the sweep runs the range rather than
   * asserting that, because "the biggest angle is the worst one" is exactly
   * the kind of thing that stops being true when somebody changes the shape
   * of a piece.
   */
  const tiltMagnitudes: number[] = []
  for (let degrees = minTiltDegrees; degrees <= maxTiltDegrees; degrees += 0.5) tiltMagnitudes.push(degrees)

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
    const tileSize = pixels(sizes, '--m8-tile-size')
    const edgeHeight = pixels(sizes, '--m8-table-thickness')
    const scatterStep = pixels(sizes, '--m8-scatter-step')
    const qrScatterStep = pixels(sizes, '--m8-qr-scatter-step')
    const tileLift = scatterStep * maxLiftSteps
    const qrLift = qrScatterStep * maxLiftSteps
    const widestGap = pixels(sizes, '--m8-piece-gap') + scatterStep * maxSpaceSteps
    // `.m8-address` is two scatter steps further down than every other gap
    // on this screen, which is what keeps the lowest tile's shadow off it.
    const addressGap = pixels(sizes, '--m8-row-gap') + scatterStep * 2
    // A box shadow's blur spreads about half its radius past the shadow's own
    // edge, so this is how far below a piece the shadow actually reaches.
    const shadowReach = pixels(sizes, '--m8-shadow-lift') + pixels(sizes, '--m8-shadow-blur') / 2

    /** The QR, turned and lifted as far as the scatter can take it. */
    function qrNeeds(degrees: number): number {
      return scatteredExtent(qrOuter, degrees, qrLift)
    }

    /**
     * The code block: the tiles, turned and lifted, then the gap and the
     * address line under them.
     *
     * The block is centred in the table by its *layout* box, which a
     * transform does not change, so a tile thrown upwards out of that box
     * needs the same room again at the bottom before the block would be
     * pushed off centre. Hence twice the corner and twice the lift, even
     * though only one tile can be at the top of its range at a time.
     */
    function codeBlockNeeds(degrees: number): number {
      const layout = tileSize + addressGap + pixels(sizes, '--m8-address-type')
      return layout + (tiltOverhang(tileSize, degrees) + tileLift) * 2
    }

    function stageFor(participants: number, degrees: number = maxTiltDegrees) {
      return {
        eyebrowHeight: pixels(sizes, '--m8-wordmark-type'),
        tableGap: pixels(sizes, '--m8-row-gap'),
        // The whole element: what lies on it at its most scattered, and the
        // band along its lower edge, which is inside its box and is not
        // surface anything may be drawn on.
        tableMinHeight: surfaceHeight(Math.max(qrNeeds(degrees), codeBlockNeeds(degrees)), edgeHeight),
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

    it.each(tiltMagnitudes)('leaves the table room for the QR it carries, turned %s degrees', (degrees) => {
      // The other half of the same squeeze: once the table had been pushed to
      // its content height, the QR's turned bounding box overhung the
      // surface — 15px at 1920, 9px at 1280. Widening the tilt and lifting
      // the pieces both make that worse, which is why the QR gave up 16% of
      // its size in the same change.
      const room = surfaceContentHeight(tableHeight(stageFor(MAX_PARTICIPANTS), safe.height), edgeHeight)
      expect(room).toBeGreaterThanOrEqual(qrNeeds(degrees))
    })

    it.each(tiltMagnitudes)('keeps the code block on the table at %s degrees', (degrees) => {
      const room = surfaceContentHeight(tableHeight(stageFor(MAX_PARTICIPANTS), safe.height), edgeHeight)
      expect(room).toBeGreaterThanOrEqual(codeBlockNeeds(degrees))
    })

    it.each(tiltMagnitudes)('keeps the pieces inside the table sideways at %s degrees', (degrees) => {
      // Sideways the table is the whole safe width, and the two things on it
      // are the code block and the QR with the block margin between them.
      // Every gap at its widest and every piece at its most turned.
      const tiles = [tileSize, tileSize, tileSize, tileSize]
      const across =
        rowExtent(tiles, [widestGap, widestGap, widestGap], degrees) +
        pixels(sizes, '--m8-block-gap') +
        tiltedExtent(qrOuter, degrees)
      expect(across).toBeLessThanOrEqual(safe.width)
    })

    it('keeps the gap between two tiles wider than the corners they throw at each other', () => {
      // Two neighbours turned opposite ways reach towards each other by their
      // corners. A gap narrower than both together lets them touch, which is
      // the one way this scatter can look like a bug rather than a table.
      // This is why widening the tilt also widened `--m8-piece-gap`.
      expect(pixels(sizes, '--m8-piece-gap')).toBeGreaterThanOrEqual(tiltOverhang(tileSize, maxTiltDegrees) * 2)
    })

    it('keeps the lowest tile, and its shadow, clear of the address line', () => {
      // A tile at the bottom of its range has dropped by its full lift and
      // thrown a corner down as well, and the shadow reaches further still.
      // If the three together exceeded the gap, the code would sit on the
      // address — which is why that gap is two scatter steps wider than the
      // others rather than sharing `--m8-row-gap` with everything else.
      const reach = tileLift + tiltOverhang(tileSize, maxTiltDegrees) + shadowReach
      expect(reach).toBeLessThan(addressGap)
    })

    it('keeps the shadow a piece casts on the table rather than off its edge', () => {
      // A shadow that fell past the lower edge would be cast on the room, and
      // the whole point of it is that the piece is resting on something.
      const room = surfaceContentHeight(tableHeight(stageFor(MAX_PARTICIPANTS), safe.height), edgeHeight)
      expect((room - qrNeeds(maxTiltDegrees)) / 2).toBeGreaterThanOrEqual(shadowReach)
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
      // A bare `${chipCapPercent}%` would also let four chips at exactly the
      // cap sum to exactly the width of the line — the sub-pixel wrap this
      // guards against. The one-pixel shave is part of what is being pinned.
      expect(declaration(chipRule, 'max-width')).toBe(`calc(${chipCapPercent}% - 1px)`)
      expect(declaration(chipRule, 'overflow')).toBe('hidden')
      // The space between chips is inside the cap. Four chips of a quarter
      // each plus four margins is more than a line holds, and the fourth
      // would wrap.
      expect(declaration(chipRule, 'padding-right')).toBe('var(--m8-chip-gap)')
      expect(chipRule).not.toContain('margin-right')
    })

    it('keeps the disc a fixed square rather than letting the cap shrink it', () => {
      // The chip is deliberately over-constrained by the cap above, and a
      // flex item's default is to give up width first once its line has no
      // room left. Without `flex: 0 0 auto` here the disc's width is what
      // gives — drawn as an ellipse, not a circle, at eight people even
      // though nothing else about its box changed. This is the one fix in
      // the round that shipped without a test; the safe-area model is
      // height-only and cannot see a width-only shrink, so it is pinned
      // directly against the declaration instead.
      const discBody = rule(styles, '.m8-chip-disc')
      expect(declaration(discBody, 'flex')).toBe('0 0 auto')
      expect(declaration(discBody, 'width')).toBe('var(--m8-disc-size)')
      expect(declaration(discBody, 'height')).toBe(declaration(discBody, 'width'))
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

    it('gives the table a thickness that the arithmetic above charges for', () => {
      // The band along the lower edge is what makes the table furniture
      // rather than a colour. It is inside the element's box, so it is
      // height the pieces do not get — if it were ever drawn some other way,
      // `stageFor` would be charging for space nothing takes and the model
      // would be measuring a layout that no longer exists.
      const body = rule(styles, '.m8-table')
      expect(declaration(body, 'border-bottom')).toBe(
        'var(--m8-table-thickness) solid var(--m8-table-edge)',
      )
      expect(declaration(rule(tokens, ':root'), '--m8-table-edge')).toMatch(/^#[0-9a-f]{6}$/)
    })

    it('keeps the address on one line, which both proofs assume', () => {
      // `window.location.host` is the one string on this screen nothing caps.
      // The vertical model charges the code block for a single address line
      // and has 33.8px of slack at 1920, so a wrapped address would overflow
      // the table by a whole line; the sideways model assumes the block is no
      // wider than its row of tiles, which a host is nowhere near. `nowrap`
      // is what makes the unbounded string land on the axis with room.
      expect(declaration(rule(styles, '.m8-address'), 'white-space')).toBe('nowrap')
    })

    it.each(['.m8-tile', '.m8-qr'])('drops a shadow under %s', (selector) => {
      // The tilt without a shadow reads as a layout mistake; with one it
      // reads as an object put down on a surface. Both pieces carry it, and
      // the colour comes from the tokens like every other colour does.
      expect(declaration(rule(styles, selector), 'box-shadow')).toBe(
        '0 var(--m8-shadow-lift) var(--m8-shadow-blur) var(--m8-shadow)',
      )
    })

    it.each(['.m8-chip-name', '.m8-chip-note'])('truncates %s rather than widening', (selector) => {
      const body = rule(styles, selector)
      expect(declaration(body, 'overflow')).toBe('hidden')
      expect(declaration(body, 'text-overflow')).toBe('ellipsis')
      expect(declaration(body, 'white-space')).toBe('nowrap')
    })
  })
})
