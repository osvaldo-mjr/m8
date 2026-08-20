import type { Clock } from '@m8/core'

/**
 * The only reader of the system clock in the whole process.
 *
 * It lives here rather than in `packages/core` because reading the wall clock
 * is I/O, and core performs none: core declares the `Clock` interface and
 * takes an implementation as an input, which is what makes an expiry window
 * testable without waiting for one. This is the composition root's job.
 */
export class SystemClock implements Clock {
  now(): number {
    return Date.now()
  }
}
