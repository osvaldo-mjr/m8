/**
 * Core reads no clock of its own. Time is an input, which is what makes an
 * expiry window testable without waiting for one. The implementation that
 * actually reads the wall clock is `SystemClock`, and it lives in
 * `apps/server` because reading a clock is I/O and core performs none.
 */
export interface Clock {
  now(): number
}

/** A clock a test drives by hand. No I/O: the time is whatever it was told. */
export class FixedClock implements Clock {
  #now: number

  constructor(start = 0) {
    this.#now = start
  }

  now(): number {
    return this.#now
  }

  advance(ms: number): void {
    this.#now += ms
  }
}
