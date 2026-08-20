import { describe, expect, it } from 'vitest'
import { createRng, rngInt, rngShuffle, type Rng } from './rng.js'

describe('rngInt', () => {
  it('returns a value inside the requested range', () => {
    let rng = createRng(1)
    for (let i = 0; i < 200; i += 1) {
      const [value, next] = rngInt(rng, 6)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(6)
      rng = next
    }
  })

  it('produces the same sequence for the same seed', () => {
    const take = (seed: number): number[] => {
      let rng = createRng(seed)
      const out: number[] = []
      for (let i = 0; i < 10; i += 1) {
        const [value, next] = rngInt(rng, 100)
        out.push(value)
        rng = next
      }
      return out
    }

    expect(take(42)).toEqual(take(42))
  })

  it('produces different sequences for different seeds', () => {
    const [a] = rngInt(createRng(1), 1_000_000)
    const [b] = rngInt(createRng(2), 1_000_000)
    expect(a).not.toEqual(b)
  })

  it('advances the cursor without changing the seed', () => {
    const rng = createRng(7)
    const [, next] = rngInt(rng, 10)
    expect(next.seed).toBe(7)
    expect(next.cursor).toBe(rng.cursor + 1)
  })

  it('draws the same value from a literal Rng as from one reached by advancing in-process', () => {
    let inProcess = createRng(5)
    for (let i = 0; i < 3; i += 1) {
      ;[, inProcess] = rngInt(inProcess, 6)
    }
    const persisted: Rng = { seed: 5, cursor: 3 }

    const [fromPersisted] = rngInt(persisted, 6)
    const [fromInProcess] = rngInt(inProcess, 6)

    expect(fromPersisted).toBe(fromInProcess)
  })

  it('draws the same value after a JSON round trip as before it', () => {
    let rng = createRng(11)
    for (let i = 0; i < 4; i += 1) {
      ;[, rng] = rngInt(rng, 6)
    }
    const roundTripped: Rng = JSON.parse(JSON.stringify(rng))

    expect(roundTripped).toEqual(rng)
    const [beforeRoundTrip] = rngInt(rng, 6)
    const [afterRoundTrip] = rngInt(roundTripped, 6)
    expect(afterRoundTrip).toBe(beforeRoundTrip)
  })
})

describe('rngShuffle', () => {
  it('returns a permutation of the input', () => {
    const items = ['a', 'b', 'c', 'd', 'e']
    const [shuffled] = rngShuffle(createRng(3), items)
    expect([...shuffled].sort()).toEqual([...items].sort())
  })

  it('does not mutate the input', () => {
    const items = ['a', 'b', 'c']
    rngShuffle(createRng(3), items)
    expect(items).toEqual(['a', 'b', 'c'])
  })

  it('is deterministic for the same seed', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f']
    const [first] = rngShuffle(createRng(9), items)
    const [second] = rngShuffle(createRng(9), items)
    expect(first).toEqual(second)
  })

  it('shuffles the same way from a literal Rng as from one reached by advancing in-process', () => {
    const items = ['a', 'b', 'c', 'd', 'e']
    let inProcess = createRng(5)
    for (let i = 0; i < 3; i += 1) {
      ;[, inProcess] = rngInt(inProcess, 6)
    }
    const persisted: Rng = { seed: 5, cursor: 3 }

    const [fromPersisted] = rngShuffle(persisted, items)
    const [fromInProcess] = rngShuffle(inProcess, items)

    expect(fromPersisted).toEqual(fromInProcess)
  })

  it('shuffles the same way after a JSON round trip as before it', () => {
    const items = ['a', 'b', 'c', 'd', 'e']
    let rng = createRng(11)
    for (let i = 0; i < 4; i += 1) {
      ;[, rng] = rngInt(rng, 6)
    }
    const roundTripped: Rng = JSON.parse(JSON.stringify(rng))

    expect(roundTripped).toEqual(rng)
    const [beforeRoundTrip] = rngShuffle(rng, items)
    const [afterRoundTrip] = rngShuffle(roundTripped, items)
    expect(afterRoundTrip).toEqual(beforeRoundTrip)
  })
})
