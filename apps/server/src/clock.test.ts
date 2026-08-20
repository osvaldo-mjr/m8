import { describe, expect, it } from 'vitest'
import { SystemClock } from './clock.js'

describe('SystemClock', () => {
  it('reports the wall clock', () => {
    const before = Date.now()
    const now = new SystemClock().now()
    const after = Date.now()

    expect(now).toBeGreaterThanOrEqual(before)
    expect(now).toBeLessThanOrEqual(after)
  })
})
