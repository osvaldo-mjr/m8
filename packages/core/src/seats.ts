/**
 * A role in a game, not a person. A seat references whoever currently occupies
 * it and never owns them, which is what lets one concept carry rotation,
 * reconnection and handover.
 */
export interface Seat {
  readonly number: number
  readonly occupantId: string | null
}

export function createSeats(max: number): Seat[] {
  return Array.from({ length: max }, (_unused, index) => ({
    number: index + 1,
    occupantId: null,
  }))
}

export function firstFreeSeat(seats: readonly Seat[]): Seat | undefined {
  return seats.find((seat) => seat.occupantId === null)
}

export function seatOf(seats: readonly Seat[], participantId: string): Seat | undefined {
  return seats.find((seat) => seat.occupantId === participantId)
}

export function occupiedCount(seats: readonly Seat[]): number {
  return seats.filter((seat) => seat.occupantId !== null).length
}

/** Starting needs the manifest's minimum seated. A game whose minimum is below
 * its maximum may therefore begin with a chair still empty — and that chair
 * stays closed for the match, because the game builds its state from the seats
 * that were occupied when it started. */
export function canStart(seats: readonly Seat[], min: number): boolean {
  return occupiedCount(seats) >= min
}
