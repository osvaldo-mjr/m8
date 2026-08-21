/**
 * One colour per person, by arrival order, shared by both screens.
 *
 * This is the whole signature of the identity: the colour a person is given
 * follows them onto the television and onto their own phone, so a room of
 * people who cannot read a nickname from three metres can still see that the
 * coral one just joined. When games arrive their pieces inherit the same
 * colours.
 *
 * It lives here, beside the tokens themselves, because both apps need the
 * same answer and neither may import the other. No colour value appears
 * below — only the name of the custom property that holds it, so
 * `tokens.css` stays the one place a colour is written down.
 *
 * "Arrival order" is the participant's index in the snapshot the server
 * sends, which both screens read from the same message and therefore cannot
 * disagree about. It is not stable across a departure: if the second of four
 * people leaves, the two behind them shift one colour along. That is
 * deliberate — the alternative, hashing a participant id, lets two people at
 * the same table land on the same colour, and two identical colours in the
 * room breaks the one thing this is for.
 */

/** How many colours the palette holds before it has to repeat. */
export const PERSON_COLOR_COUNT = 8

/**
 * The custom property each screen sets on the element that belongs to one
 * person. Styling reads `var(--m8-person)` and stays ignorant of which
 * person it is looking at.
 */
export const PERSON_COLOR_PROPERTY = '--m8-person'

/**
 * The colour for the person who arrived at `arrivalIndex`, as a CSS value.
 *
 * A `var(...)` reference, never a literal: this file must not know what
 * coral looks like. Negative indices are normalised rather than rejected —
 * there is no caller that should pass one, and a table drawn in the wrong
 * colour is a better failure on a television than a table not drawn at all.
 */
export function personColor(arrivalIndex: number): string {
  const slot = ((arrivalIndex % PERSON_COLOR_COUNT) + PERSON_COLOR_COUNT) % PERSON_COLOR_COUNT
  return `var(--m8-person-${slot + 1})`
}
