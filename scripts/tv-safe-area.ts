/**
 * The vertical arithmetic of the large screen, as plain numbers.
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
 * overhang the violet surface by fifteen pixels once the table had been
 * squeezed to its minimum.
 */
export function tiltedExtent(size: number, degrees: number): number {
  const radians = (Math.abs(degrees) * Math.PI) / 180
  return size * (Math.cos(radians) + Math.sin(radians))
}

export interface Stage {
  /** The wordmark line across the top. */
  readonly eyebrowHeight: number
  /** The margin between the eyebrow row and the table. */
  readonly tableGap: number
  /** The smallest the table can be: what is lying on it, turned. */
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
