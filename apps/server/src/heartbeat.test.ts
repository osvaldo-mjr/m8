import { describe, expect, it } from 'vitest'
import { HEARTBEAT } from './socket-transport.js'

/**
 * A device that vanishes without closing its socket — aeroplane mode, a dead
 * battery, someone walking out of range — is only noticed by the heartbeat.
 * This pins the budget rather than the individual numbers: tune them freely,
 * but a silent departure must still surface to the room quickly enough that
 * nobody is left staring at a screen showing someone who has gone.
 */
const NOTICE_BUDGET_MS = 15_000

describe('the heartbeat budget', () => {
  it('notices a silently vanished device well inside the budget', () => {
    expect(HEARTBEAT.pingInterval + HEARTBEAT.pingTimeout).toBeLessThanOrEqual(NOTICE_BUDGET_MS)
  })

  it('is not so eager that an ordinary network hiccup trips it', () => {
    expect(HEARTBEAT.pingTimeout).toBeGreaterThanOrEqual(3_000)
  })
})
