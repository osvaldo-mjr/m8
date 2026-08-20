/**
 * Core reads no clock of its own. Time is an input, which is what makes an
 * expiry window testable without waiting for one.
 */
export interface Clock {
  now(): number
}

export class SystemClock implements Clock {
  now(): number {
    return Date.now()
  }
}

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
