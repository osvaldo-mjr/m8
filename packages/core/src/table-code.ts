import { rngInt, type Rng } from './rng.js'

/**
 * Thirty symbols with no visually ambiguous pairs: no I/L/1, no O/0, no U.
 * A player reads this off a television from three metres away and types it on a
 * phone, so a character that can be misread is a character that cannot be used.
 */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789'

export const CODE_LENGTH = 4

/**
 * The first character identifies the instance that owns the table, so routing
 * can be a pure function of the code the player scanned. With a single
 * instance it is constant and nobody notices.
 */
export function generateTableCode(rng: Rng, shard: string): readonly [string, Rng] {
  if (shard.length !== 1 || !CODE_ALPHABET.includes(shard)) {
    throw new RangeError(`shard must be a single character from CODE_ALPHABET, got ${shard}`)
  }

  let current = rng
  let code = shard
  for (let i = 1; i < CODE_LENGTH; i += 1) {
    const [index, next] = rngInt(current, CODE_ALPHABET.length)
    code += CODE_ALPHABET.charAt(index)
    current = next
  }
  return [code, current]
}

/** Returns the canonical code, or null when the input cannot be one. */
export function normalizeTableCode(input: string): string | null {
  const candidate = input.trim().toUpperCase()
  if (candidate.length !== CODE_LENGTH) return null
  for (const char of candidate) {
    if (!CODE_ALPHABET.includes(char)) return null
  }
  return candidate
}
