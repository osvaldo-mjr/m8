/**
 * A seeded, serializable pseudo-random source.
 *
 * The value is plain data so it can live inside match state and travel with it.
 * Every draw returns the next Rng rather than mutating, which is what makes a
 * match reproducible from its seed and its sequence of actions.
 */
export interface Rng {
  readonly seed: number
  readonly cursor: number
}

export function createRng(seed: number): Rng {
  return { seed: seed >>> 0, cursor: 0 }
}

/** mulberry32, keyed on seed and cursor so any draw is addressable. */
function sample(rng: Rng): number {
  let t = (rng.seed + (rng.cursor + 1) * 0x6d2b79f5) >>> 0
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
}

function advance(rng: Rng): Rng {
  return { seed: rng.seed, cursor: rng.cursor + 1 }
}

export function rngInt(rng: Rng, maxExclusive: number): readonly [number, Rng] {
  if (!Number.isInteger(maxExclusive) || maxExclusive < 1) {
    throw new RangeError(`maxExclusive must be a positive integer, got ${maxExclusive}`)
  }
  return [Math.floor(sample(rng) * maxExclusive), advance(rng)]
}

export function rngShuffle<T>(rng: Rng, items: readonly T[]): readonly [T[], Rng] {
  const out = [...items]
  let current = rng
  for (let i = out.length - 1; i > 0; i -= 1) {
    const [j, next] = rngInt(current, i + 1)
    const a = out[i] as T
    const b = out[j] as T
    out[i] = b
    out[j] = a
    current = next
  }
  return [out, current]
}
