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
  peopleTopEdge,
  radialStopEdge,
  rowsNeeded,
  safeArea,
  scatteredExtent,
  shadowReach,
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

describe('the shadow a piece throws', () => {
  it('reaches its own offset plus half its blur', () => {
    // Downwards that offset is `--m8-shadow-lift` plus whatever the lamp adds
    // for a piece that sits off the row's centre line; sideways there is no
    // constant, only what the lamp adds.
    expect(shadowReach(5, 1, 3, 14)).toBe(15)
    expect(shadowReach(0, 4, 3, 14)).toBe(19)
  })

  it('reaches further the further the piece is from the lamp', () => {
    // The whole point of the directional shadow: a piece at the end of the
    // row throws further than one near the middle, so the model has to charge
    // the end of the row rather than an average.
    expect(shadowReach(0, 4, 3, 14)).toBeGreaterThan(shadowReach(0, 1, 3, 14))
    // With no steps it collapses to the straight-down shadow the stylesheet
    // declares, which is what a piece that never reaches the renderer gets.
    expect(shadowReach(5, 0, 3, 14)).toBe(12)
  })
})

describe('the lamp above the table', () => {
  it('puts a stop at the centre plus that fraction of the radius', () => {
    // A stop position in a radial gradient is a fraction of the ray from the
    // centre to the ending shape, so a stop at 38% of a 66%-tall ellipse
    // centred at 40% lands just over a quarter of the screen below it.
    expect(radialStopEdge(40, 66, 0.38)).toBeCloseTo(65.08)
    expect(radialStopEdge(40, 66, 1)).toBeCloseTo(106)
  })
})

describe('where the row of people begins', () => {
  it('is measured from the top of the screen, not the top of the safe area', () => {
    // The floor is drawn on `body`, so the lamp's stops resolve against the
    // viewport and know nothing about the overscan margin. That is why this
    // one measurement starts at the screen's own edge.
    const stage = { eyebrowHeight: 64, tableGap: 44, tableMinHeight: 461, peopleHeight: 280 }
    expect(peopleTopEdge(stage, 96, 500, 44)).toBe(748)
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
   * Colour, as arithmetic. Four small functions, because the whole of this
   * round's palette rests on ratios that until now were only in a document.
   *
   * The one that found this round's defect — a headline that had sat in the
   * product at 1.73:1 for rounds because nobody had computed it — is
   * `contrast`. The systemic answer to a colour nobody measured is not
   * another paragraph promising it was measured; it is an assertion.
   */

  /** `#rrggbb` or `rgba(r, g, b, a)` as channels 0-255, alpha ignored. */
  function rgb(value: string): [number, number, number] {
    const text = value.trim()
    const digits = /^#([0-9a-f]{6})$/i.exec(text)
    if (digits !== null && digits[1] !== undefined) {
      const hex = digits[1]
      return [0, 2, 4].map((at) => Number.parseInt(hex.slice(at, at + 2), 16)) as [number, number, number]
    }
    const parts = /^rgba?\(([^)]*)\)$/i.exec(text)
    if (parts === null || parts[1] === undefined) throw new Error(`Not a colour: ${value}`)
    const numbers = parts[1].split(',').map((each) => Number.parseFloat(each))
    if (numbers.length < 3) throw new Error(`Not a colour: ${value}`)
    return [numbers[0] ?? 0, numbers[1] ?? 0, numbers[2] ?? 0]
  }

  /** The alpha of an `rgba()` value; an opaque colour is 1. */
  function alpha(value: string): number {
    const parts = /^rgba\(([^)]*)\)$/i.exec(value.trim())
    if (parts === null || parts[1] === undefined) return 1
    const numbers = parts[1].split(',')
    return numbers.length < 4 ? 1 : Number.parseFloat(numbers[3] ?? '1')
  }

  /**
   * A translucent colour painted over an opaque one — which is what a chip
   * actually stands on, and the whole reason these figures have to be
   * computed rather than read off the token. `--m8-lamp-2` covers the entire
   * viewport, so the floor beneath a person's colour is never `--m8-ground`
   * itself.
   */
  function over(source: string, under: [number, number, number]): [number, number, number] {
    const a = alpha(source)
    const top = rgb(source)
    return [0, 1, 2].map((i) => (top[i] ?? 0) * a + (under[i] ?? 0) * (1 - a)) as [number, number, number]
  }

  /**
   * WCAG relative luminance, which is what the lighting stack below is
   * ordered by. Computed here rather than eyeballed: a test that ordered the
   * palette by eye would be no better than the eye that produced the palette.
   */
  function luminanceOf(channels: [number, number, number]): number {
    const linear = channels.map((value) => {
      const channel = value / 255
      return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4)
    })
    return 0.2126 * (linear[0] ?? 0) + 0.7152 * (linear[1] ?? 0) + 0.0722 * (linear[2] ?? 0)
  }

  function luminance(value: string): number {
    return luminanceOf(rgb(value))
  }

  function contrast(a: [number, number, number], b: [number, number, number]): number {
    const first = luminanceOf(a)
    const second = luminanceOf(b)
    return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
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

  /**
   * The lamp on the floor, as numbers.
   *
   * Read out of the stylesheet rather than restated, the same way every other
   * size in this file is: the gradient is where the light's shape actually
   * lives, and the assertion that depends on it is a contrast guarantee.
   */
  const floorRule = /(?:^|[\n}])\s*body\s*\{([^}]*background-image[^}]*)\}/.exec(styles)
  if (floorRule === null || floorRule[1] === undefined) throw new Error('No floor on body')
  const floorImage = declaration(floorRule[1], 'background-image')
  const ellipse = /ellipse\s+([\d.]+)%\s+([\d.]+)%\s+at\s+([\d.]+)%\s+([\d.]+)%/.exec(floorImage)
  if (ellipse === null) throw new Error(`No lamp ellipse in ${floorImage}`)
  // The position of the first stop drawn in the dimmer tint is where the
  // bright step ends.
  const innerStop = /var\(--m8-lamp-2\)\s+([\d.]+)%/.exec(floorImage)
  if (innerStop === null || innerStop[1] === undefined) throw new Error('No step between the two tints')
  const lamp = {
    radiusY: Number.parseFloat(ellipse[2] ?? ''),
    centreY: Number.parseFloat(ellipse[4] ?? ''),
    innerStop: Number.parseFloat(innerStop[1]),
  }

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
  const maxShadowSteps = 4
  it.each([
    ['TILT_MIN_DEGREES', minTiltDegrees],
    ['TILT_MAX_DEGREES', maxTiltDegrees],
    ['MAX_LIFT_STEPS', maxLiftSteps],
    ['MAX_SPACE_STEPS', maxSpaceSteps],
    ['MAX_SHADOW_STEPS', maxShadowSteps],
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
    // edge. Downwards a piece is offset by `--m8-shadow-lift` and by one step
    // in whichever direction its own lift took it; sideways it is offset by
    // up to `MAX_SHADOW_STEPS`, which is what the piece at the end of the row
    // gets. Both are charged, because the lamp made the shadow a claim on two
    // axes rather than one.
    const shadowStep = pixels(sizes, '--m8-shadow-step')
    const shadowBlur = pixels(sizes, '--m8-shadow-blur')
    const shadowDown = shadowReach(pixels(sizes, '--m8-shadow-lift'), 1, shadowStep, shadowBlur)
    const shadowAcross = shadowReach(0, maxShadowSteps, shadowStep, shadowBlur)

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
      // Plus the shadow the piece at each end throws outwards, which is the
      // one thing here that reaches past the box that casts it. The leftmost
      // tile throws left and the QR throws right, both at the full step count.
      const across =
        rowExtent(tiles, [widestGap, widestGap, widestGap], degrees) +
        pixels(sizes, '--m8-block-gap') +
        tiltedExtent(qrOuter, degrees) +
        shadowAcross * 2
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
      const reach = tileLift + tiltOverhang(tileSize, maxTiltDegrees) + shadowDown
      expect(reach).toBeLessThan(addressGap)
    })

    it('keeps the shadow a piece casts on the table rather than off its edge', () => {
      // A shadow that fell past the lower edge would be cast on the room, and
      // the whole point of it is that the piece is resting on something.
      const room = surfaceContentHeight(tableHeight(stageFor(MAX_PARTICIPANTS), safe.height), edgeHeight)
      expect((room - qrNeeds(maxTiltDegrees)) / 2).toBeGreaterThanOrEqual(shadowDown)
    })

    it('stops the bright step of the lamp above the row of people', () => {
      // This is a contrast constraint expressed as geometry, and it is the
      // one claim in this round that a picture cannot check for you.
      //
      // The eight person colours are measured against whatever is brightest
      // under a chip. On the outer step of the light pool the worst of the
      // eight is 4.90:1; on the inner step it is 3.71:1, and three of the
      // eight fall under 4.5:1. So "the bright step stops before the people
      // do" is what makes the palette hold — and it is a percentage inside a
      // gradient, which nothing else in this repository would notice
      // changing.
      //
      // The worst case is a full table: eight people take two lines, the
      // table above is squeezed to its smallest, and the row starts higher up
      // the screen than at any other count.
      const stage = stageFor(MAX_PARTICIPANTS)
      const rowGap = pixels(sizes, '--m8-row-gap')
      const top = peopleTopEdge(stage, screen.width * insetRatio, tableHeight(stage, safe.height), rowGap)
      const edge = radialStopEdge(lamp.centreY, lamp.radiusY, lamp.innerStop / 100)
      expect((edge / 100) * screen.height).toBeLessThan(top)
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

    it.each(['1280x720', '1920x1080'])('declares a shadow step at %s', (name) => {
      // The lamp's sideways term. Both tiers must declare it, or one
      // resolution silently loses the direction and every shadow falls
      // straight down again — which is the arrangement this round replaced.
      const sizes = name === '1920x1080' ? large : base
      expect(pixels(sizes, '--m8-shadow-step')).toBeGreaterThan(0)
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

  /**
   * The room, and the one claim it rests on.
   *
   * The floor and the tabletop are gradients rather than images, and the
   * argument for that is that a television ruins a smooth gradient: its own
   * contrast processing turns a soft falloff into a stack of visible stripes.
   * Banding is a *ramp* being quantised, so the answer is to have no ramp —
   * every colour is written twice, at the same position, and what is left is
   * flat regions separated by edges the design drew deliberately.
   *
   * That argument is only as good as the stylesheet, and one stop written at
   * the wrong position turns a step into a ramp with nothing in the diff to
   * see. So it is checked rather than asserted: every gradient in the
   * stylesheet is parsed, and any two consecutive stops of different colours
   * must sit at the same position.
   */
  describe('the room the screen draws', () => {
    /** Split a comma-separated CSS list, ignoring commas inside brackets. */
    function parts(list: string): string[] {
      const found: string[] = []
      let depth = 0
      let current = ''
      for (const character of list) {
        if (character === '(') depth += 1
        if (character === ')') depth -= 1
        if (character === ',' && depth === 0) {
          found.push(current.trim())
          current = ''
          continue
        }
        current += character
      }
      found.push(current.trim())
      return found.filter((piece) => piece !== '')
    }

    /** Every gradient in a `background-image`, as its argument list. */
    function gradients(value: string): string[] {
      const found: string[] = []
      const pattern = /(?:repeating-)?(?:linear|radial)-gradient\(/g
      let match = pattern.exec(value)
      while (match !== null) {
        let depth = 1
        let index = match.index + match[0].length
        const start = index
        while (index < value.length && depth > 0) {
          if (value.charAt(index) === '(') depth += 1
          if (value.charAt(index) === ')') depth -= 1
          index += 1
        }
        found.push(value.slice(start, index - 1))
        pattern.lastIndex = index
        match = pattern.exec(value)
      }
      return found
    }

    /**
     * The colour stops of one gradient. The first argument of a gradient is
     * its shape or its direction, never a colour, so anything that does not
     * begin with a colour is dropped rather than parsed.
     */
    function colorStops(argumentList: string): { color: string; position: string }[] {
      const stops: { color: string; position: string }[] = []
      for (const piece of parts(argumentList)) {
        if (!/^(?:var\(|transparent\b|rgba?\(|#)/.test(piece)) continue
        const split = /^(var\([^)]*\)|transparent|rgba?\([^)]*\)|#[0-9a-f]{3,8})\s*(.*)$/i.exec(piece)
        if (split === null || split[1] === undefined || split[2] === undefined) {
          throw new Error(`Unparsed colour stop: ${piece}`)
        }
        stops.push({ color: split[1], position: split[2].trim() })
      }
      return stops
    }

    /**
     * Everything about one gradient that would let it ramp, in words.
     *
     * Two ways, and the second is the one the first version of this guard
     * missed. A stop can carry a position that differs from its neighbour's,
     * which is the obvious ramp — and a stop can carry *no position at all*,
     * which is the plainest ramp there is: `linear-gradient(to bottom, a, b)`
     * is a smooth fade from top to bottom, it has no positions to disagree
     * about, and a guard that only compares positions passes it. That is
     * exactly the edit this guard exists to stop, because it is what somebody
     * softening the lamp in place would write. The count assertion below does
     * not cover it either: it catches a gradient being *added*, not one being
     * replaced.
     */
    function rampFaults(argumentList: string): string[] {
      const stops = colorStops(argumentList)
      const faults: string[] = []
      if (stops.length < 2) faults.push('fewer than two colour stops')
      for (let index = 0; index < stops.length; index += 1) {
        const stop = stops[index]
        if (stop === undefined) continue
        if (stop.position === '') faults.push(`${stop.color} carries no position`)
        const before = index === 0 ? undefined : stops[index - 1]
        if (before === undefined || before.color === stop.color) continue
        if (before.position !== stop.position) {
          faults.push(`${before.color} ${before.position} ramps into ${stop.color} ${stop.position}`)
        }
      }
      return faults
    }

    /** Every gradient the stylesheet declares, with where it was found. */
    const declared: { where: string; argumentList: string }[] = []
    for (const match of styles.matchAll(/(?:^|[;{])\s*background-image\s*:\s*([^;]+)/g)) {
      const value = match[1]
      if (value === undefined) continue
      for (const argumentList of gradients(value)) {
        declared.push({ where: value.slice(0, 40), argumentList })
      }
    }

    it('draws the floor and the tabletop with gradients rather than images', () => {
      // Five: the lamp on the floor, the two sets of floor-tile joints, the
      // lamp on the table, and the boards. If this ever fell to zero the
      // assertion below would pass vacuously.
      expect(declared.length).toBe(5)
      expect(styles).not.toContain('url(')
    })

    it('gives every gradient stop a partner at the same position, so nothing can band', () => {
      for (const gradient of declared) {
        expect([gradient.where, rampFaults(gradient.argumentList)]).toEqual([gradient.where, []])
      }
    })

    it.each([
      ['var()', 'to bottom, var(--m8-lamp-1), var(--m8-lamp-2)'],
      ['hex', 'to bottom, #9b6437, #8d5b32'],
      ['rgba()', 'to bottom, rgba(255, 217, 168, 0.16), rgba(255, 217, 168, 0.06)'],
      ['one stop positioned and one not', 'to bottom, var(--m8-lamp-1) 0, var(--m8-lamp-2)'],
      ['positions that disagree', 'to bottom, var(--m8-lamp-1) 0, var(--m8-lamp-1) 38%, var(--m8-lamp-2) 40%'],
    ])('rejects a gradient that ramps, written in the %s form', (_form, argumentList) => {
      // The first three of these passed the first version of this guard,
      // which compared positions as strings and recorded a missing position
      // as an empty one — so two stops with no positions compared equal. They
      // are the plainest ramp CSS can express and the likeliest edit to
      // arrive: somebody softening the lamp where it stands.
      expect(rampFaults(argumentList).length).toBeGreaterThan(0)
    })

    it('accepts the hard-stopped form the stylesheet actually uses', () => {
      // Guards the guard from the other side: a check that rejected
      // everything would pass the five assertions above by accident.
      expect(
        rampFaults('ellipse 140% 66% at 50% 40%, var(--m8-lamp-1) 0, var(--m8-lamp-1) 38%, var(--m8-lamp-2) 38%, var(--m8-lamp-2) 100%, transparent 100%'),
      ).toEqual([])
    })

    it('lights the room from above the table rather than everywhere', () => {
      // A lamp over a table lights the table, not the room — which is also
      // what keeps the floor under the chips dark enough for eight saturated
      // colours to be told apart on it.
      const floor = /(?:^|[\n}])\s*body\s*\{([^}]*background-image[^}]*)\}/.exec(styles)
      expect(floor).not.toBeNull()
      const body = floor === null || floor[1] === undefined ? '' : floor[1]
      const image = declaration(body, 'background-image')
      expect(image).toContain('var(--m8-lamp-1)')
      expect(image).toContain('var(--m8-lamp-2)')
      expect(image).toContain('var(--m8-floor-seam)')
      expect(declaration(body, 'background-color')).toBe('var(--m8-ground)')
    })

    it('keeps the floor seam darker than the floor, so a chip never sits on a lighter one', () => {
      // The eight person colours are measured against whatever is brightest
      // under a chip. A lighter grout would become that and would cost every
      // one of them contrast; darker, it can only give contrast back.
      const root = rule(tokens, ':root')
      expect(luminance(declaration(root, '--m8-floor-seam'))).toBeLessThan(
        luminance(declaration(root, '--m8-ground')),
      )
    })

    it('descends from the lit board to the shaded board to the edge to the floor', () => {
      // A lit slab in a dark room, as a lighting stack. If the edge band were
      // ever darker than the floor it would read as a hole in the picture
      // rather than as the front face of a tabletop.
      const root = rule(tokens, ':root')
      const board = luminance(declaration(root, '--m8-plank-light'))
      const dark = luminance(declaration(root, '--m8-plank-dark'))
      const edge = luminance(declaration(root, '--m8-table-edge'))
      const floor = luminance(declaration(root, '--m8-ground'))
      expect(board).toBeGreaterThan(dark)
      expect(dark).toBeGreaterThan(edge)
      expect(edge).toBeGreaterThan(floor)
    })

    /**
     * The two ratios the whole round rests on, asserted rather than published.
     *
     * Everything else in this file is a box or an ordering. These are the
     * numbers the design is actually accountable to, and until now they lived
     * only in `docs/notes/visual-identity-report.md` — which is how a headline
     * came to sit in the product at 1.73:1 for three rounds. Raising
     * `--m8-lamp-2`'s alpha, lightening `--m8-plank-light`, or touching any
     * one of the eight person colours breaks a stated guarantee, and until
     * these two assertions existed nothing failed when it did.
     */
    describe('the ratios the palette is accountable to', () => {
      const root = rule(tokens, ':root')
      const ground = rgb(declaration(root, '--m8-ground'))
      /*
       * Not `--m8-ground`: `--m8-lamp-2` has no visible outer edge, so it
       * washes the entire viewport and the floor a chip stands on is the
       * lamp over the ground. Measuring against the bare token would be
       * measuring a surface that is not on the screen.
       */
      const floor = over(declaration(root, '--m8-lamp-2'), ground)

      const people = Array.from({ length: 8 }, (_, index) => index + 1)
      it.each(people)(
        'keeps person colour %i legible against the floor the chips stand on',
        (person) => {
          // 4.5:1, not 3:1, and the reason is the smallest thing drawn in a
          // person's colour rather than the largest: `RECONNECTING` is 13px
          // at 1280, which is below the 24px that counts as large text. The
          // disc is 60px and would be comfortable at 3:1; the label is what
          // binds, and taking the flattering reading would have let the floor
          // go a long way lighter than it can.
          const colour = rgb(declaration(root, `--m8-person-${person}`))
          expect(contrast(colour, floor)).toBeGreaterThanOrEqual(4.5)
        },
      )

      it('keeps paper legible on the brightest board of the tabletop', () => {
        // The margin here is 0.10 — paper on the lightest board is 4.60:1
        // against a threshold of 4.5:1 — so this is the assertion that stops
        // somebody warming the wood by a few code values and silently taking
        // the error code under the line. The threshold comes from
        // `.m8-code-line` at 18px on the 1280 tier; at 1920 it is 26px and
        // only needs 3:1.
        const paper = rgb(declaration(root, '--m8-paper'))
        const board = rgb(declaration(root, '--m8-plank-light'))
        expect(contrast(paper, board)).toBeGreaterThanOrEqual(4.5)
      })

      it('is measuring what it claims to measure', () => {
        // Guards the two above. If `over` ever stopped compositing, `floor`
        // would silently become `--m8-ground` and both assertions would get
        // easier rather than failing — which is the exact shape of the defect
        // this round had to correct in its own report.
        expect(luminanceOf(floor)).toBeGreaterThan(luminanceOf(ground))
        expect(alpha(declaration(root, '--m8-lamp-2'))).toBeLessThan(1)
        expect(alpha(declaration(root, '--m8-paper'))).toBe(1)
      })
    })

    it('builds the tabletop out of boards with a joint between them', () => {
      const body = rule(styles, '.m8-table')
      const image = declaration(body, 'background-image')
      for (const token of [
        'var(--m8-plank-light)',
        'var(--m8-table)',
        'var(--m8-plank-dark)',
        'var(--m8-plank-seam)',
        'var(--m8-table-shade-1)',
        'var(--m8-table-shade-2)',
      ]) {
        expect(image).toContain(token)
      }
      // The boards run left to right, which is why the joints are horizontal
      // and the gradient's axis is vertical.
      expect(image).toContain('to bottom')
    })
  })
})
