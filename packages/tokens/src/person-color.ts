/**
 * One colour per seat, shared by both screens.
 *
 * This is the whole signature of the identity: the colour a seat is given
 * follows whoever sits in it onto the television and onto their own phone,
 * so a room of people who cannot read a nickname from three metres can still
 * see that the coral one just moved. When games arrive their pieces inherit
 * the same colours.
 *
 * It lives here, beside the tokens themselves, because both apps need the
 * same answer and neither may import the other. No colour value appears
 * below — only the name of the custom property that holds it, so
 * `tokens.css` stays the one place a colour is written down.
 *
 * Colour used to be assigned by arrival order: the participant's index in the
 * snapshot the server sends. That was not stable across a departure — if the
 * second of four people left, the two behind them shifted one colour along —
 * and it is exactly where the screen and the phones came to disagree about
 * who was coral, because each recomputed the shift from a slightly different
 * moment of the same snapshot.
 *
 * A seat number has no such problem. It is assigned once, when the seat is
 * created, and never moves for as long as the seat exists: seat 1 is always
 * coral, seat 2 is always cyan, whether seat 1 is occupied, empty, or about
 * to be taken by someone new. Colour follows the chair, not the person in it
 * — a person leaving takes the person, and whoever sits down after inherits
 * the colour that was already there. The whole class of disagreement this
 * caused disappears rather than being watched by a test.
 */

/** How many colours the palette holds before it has to repeat. */
export const PERSON_COLOR_COUNT = 8

/**
 * The custom property each screen sets on the element that belongs to one
 * seat. Styling reads `var(--m8-person)` and stays ignorant of which seat it
 * is looking at.
 */
export const PERSON_COLOR_PROPERTY = '--m8-person'

/**
 * The colour for seat `seatNumber`, as a CSS value. One-based, so seat 1 is
 * `--m8-person-1` — the number a seat is actually labelled with on the
 * screen, rather than an index a caller would otherwise have to remember to
 * offset.
 *
 * A `var(...)` reference, never a literal: this file must not know what
 * coral looks like. A seat number below 1 is normalised rather than
 * rejected — there is no caller that should pass one, and a table drawn in
 * the wrong colour is a better failure on a television than a table not
 * drawn at all.
 */
export function seatColor(seatNumber: number): string {
  const slot = (((seatNumber - 1) % PERSON_COLOR_COUNT) + PERSON_COLOR_COUNT) % PERSON_COLOR_COUNT
  return `var(--m8-person-${slot + 1})`
}
