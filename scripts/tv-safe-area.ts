/**
 * The arithmetic of the large screen's layout, as plain numbers.
 *
 * Mostly vertical — a television crops top and bottom as well as the sides
 * and the row of people is what runs out of room first — but the scatter
 * added a sideways claim too: the pieces on the table are turned far enough
 * now that their corners have to be accounted for, so `rowExtent` and
 * `tiltOverhang` below answer "do the pieces stay on the table" as well.
 *
 * A television crops the outer edge of its own picture and has no scrollbar
 * and nobody standing at it to scroll, so "it overflows a little" is not a
 * degraded screen — it is a row of people that the room cannot see. The
 * stylesheet's own note says the row of people is allowed two lines; this is
 * where that claim is checked rather than asserted, against the numbers the
 * stylesheet actually declares.
 *
 * Kept free of disk access, the same shape as `scripts/tv-size-budget.ts` and
 * `scripts/node-version.ts`: the decision is exercised with values, and
 * `tv-safe-area.test.ts` is what reads the real stylesheet and feeds it in.
 *
 * What this is and is not. It is a box model over declared sizes, so it
 * proves the declared numbers close. It knows nothing about font metrics, and
 * it cannot: a nickname is typed by a stranger. That gap is closed in the
 * stylesheet rather than here — a chip is capped at a fraction of the row and
 * its text truncates, so no string anybody can type changes how many chips
 * fit on a line. This models a layout that was made content-independent
 * precisely so it could be modelled.
 */

export interface Screen {
  readonly width: number
  readonly height: number
}

/**
 * What is left of the screen once the overscan margin is taken off.
 *
 * The inset is a percentage padding, and a percentage padding resolves
 * against the *width* on all four sides — so the vertical margin is a
 * fraction of the width too, not of the height. That is not an accident in
 * the stylesheet and it is not one here: getting it wrong understates the
 * vertical squeeze on a 16:9 screen by a third.
 */
export function safeArea(screen: Screen, insetRatio: number): Screen {
  const inset = screen.width * insetRatio
  return { width: screen.width - inset * 2, height: screen.height - inset * 2 }
}

/**
 * How many chips fit on one line, given the fraction of the line one chip is
 * capped at. Floored: four chips of 25% fit, and a fifth does not.
 */
export function chipsPerRow(maxWidthPercent: number): number {
  return Math.floor(100 / maxWidthPercent)
}

/** How many lines `participants` chips occupy at `perRow` to a line. */
export function rowsNeeded(participants: number, perRow: number): number {
  if (participants <= 0) return 0
  return Math.ceil(participants / perRow)
}

/**
 * The height of the row of people. Each line is a chip plus the margin above
 * it, which is the one that spaces the first line from the table and every
 * later line from the one before it.
 */
export function peopleHeight(rows: number, chipHeight: number, rowGap: number): number {
  return rows * (chipHeight + rowGap)
}

/**
 * The bounding box of a square turned by `degrees`.
 *
 * The QR is turned like everything else lying on the table, and a turned
 * square needs more room than a square. Ignoring this is how the QR came to
 * overhang the table surface by fifteen pixels once the table had been
 * squeezed to its minimum.
 */
export function tiltedExtent(size: number, degrees: number): number {
  const radians = (Math.abs(degrees) * Math.PI) / 180
  return size * (Math.cos(radians) + Math.sin(radians))
}

/**
 * How far a turned square reaches past its own edge, on one side.
 *
 * Two uses, and both are real constraints rather than tidiness. Sideways, it
 * is how far two neighbouring tiles turned in opposite directions reach
 * towards each other: a gap narrower than twice this lets them touch, which
 * is why widening the tilt also widened `--m8-piece-gap`. Downwards, it is
 * how far the lowest tile reaches towards the address line under it.
 */
export function tiltOverhang(size: number, degrees: number): number {
  return (tiltedExtent(size, degrees) - size) / 2
}

/**
 * The room a piece needs once it is both turned and lifted off the baseline.
 *
 * The lift is what stops the pieces sharing a baseline, and it is not free:
 * a piece that may sit `lift` pixels above or below centre needs `lift` at
 * each end of its box, so it costs twice what it moves. That is the whole
 * reason the QR has a smaller lift than the tiles do — it is the piece whose
 * box sets the least height the table can be drawn in.
 */
export function scatteredExtent(size: number, degrees: number, lift: number): number {
  return tiltedExtent(size, degrees) + Math.abs(lift) * 2
}

/**
 * The table is a slab, not a rectangle of colour: the band along its lower
 * edge is what gives it thickness, and it is inside the element's own box.
 * These two convert between the box and the surface that is left inside it.
 */
export function surfaceHeight(contentHeight: number, edgeHeight: number): number {
  return contentHeight + edgeHeight
}

export function surfaceContentHeight(boxHeight: number, edgeHeight: number): number {
  return boxHeight - edgeHeight
}

/**
 * How wide a row of turned pieces reaches, end to end.
 *
 * The pieces are laid out by their untilted boxes — a transform does not
 * change what a flex row measures — so the row is as wide as the boxes and
 * the gaps between them, plus the corner each end piece throws outwards.
 * `gaps` are the spaces between pieces at their widest, which is what the
 * scatter can make them.
 */
export function rowExtent(sizes: readonly number[], gaps: readonly number[], degrees: number): number {
  let total = 0
  for (const size of sizes) total += size
  for (const gap of gaps) total += gap
  const first = sizes[0]
  const last = sizes[sizes.length - 1]
  if (first === undefined || last === undefined) return total
  return total + tiltOverhang(first, degrees) + tiltOverhang(last, degrees)
}

export interface Stage {
  /** The wordmark line across the top. */
  readonly eyebrowHeight: number
  /** The margin between the eyebrow row and the table. */
  readonly tableGap: number
  /**
   * The smallest the table can be — the whole element, so what is lying on
   * it at its most scattered *and* the band along its lower edge.
   */
  readonly tableMinHeight: number
  /** The row of people, including the margin that separates it from the table. */
  readonly peopleHeight: number
}

/** The least vertical space the stage can be drawn in. */
export function stageHeight(stage: Stage): number {
  return stage.eyebrowHeight + stage.tableGap + stage.tableMinHeight + stage.peopleHeight
}

/**
 * How far the stage runs past the safe area, in pixels. Zero or less fits;
 * anything above zero is in the margin the set crops.
 */
export function overscanPixels(stage: Stage, safeHeight: number): number {
  return stageHeight(stage) - safeHeight
}

/** What the table is actually given, once everything else has taken its share. */
export function tableHeight(stage: Stage, safeHeight: number): number {
  return safeHeight - stage.eyebrowHeight - stage.tableGap - stage.peopleHeight
}
