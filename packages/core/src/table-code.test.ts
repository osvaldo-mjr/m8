import { describe, expect, it } from 'vitest'
import { createRng } from './rng.js'
import { CODE_ALPHABET, CODE_LENGTH, generateTableCode, normalizeTableCode } from './table-code.js'

describe('CODE_ALPHABET', () => {
  it('excludes every visually ambiguous character', () => {
    for (const char of ['I', 'L', 'O', 'U', '0', '1']) {
      expect(CODE_ALPHABET).not.toContain(char)
    }
  })

  it('has no duplicates', () => {
    expect(new Set(CODE_ALPHABET).size).toBe(CODE_ALPHABET.length)
  })
})

describe('generateTableCode', () => {
  it('produces a code of the declared length', () => {
    const [code] = generateTableCode(createRng(1), 'A')
    expect(code).toHaveLength(CODE_LENGTH)
  })

  it('places the shard character first', () => {
    const [code] = generateTableCode(createRng(1), 'K')
    expect(code.charAt(0)).toBe('K')
  })

  it('uses only alphabet characters', () => {
    for (let seed = 0; seed < 50; seed += 1) {
      const [code] = generateTableCode(createRng(seed), 'A')
      for (const char of code) {
        expect(CODE_ALPHABET).toContain(char)
      }
    }
  })

  it('is deterministic for the same seed', () => {
    const [first] = generateTableCode(createRng(11), 'A')
    const [second] = generateTableCode(createRng(11), 'A')
    expect(first).toBe(second)
  })

  it('rejects a shard character outside the alphabet', () => {
    expect(() => generateTableCode(createRng(1), 'O')).toThrow(/shard/i)
  })
})

describe('normalizeTableCode', () => {
  it('uppercases valid input', () => {
    expect(normalizeTableCode('kxtp')).toBe('KXTP')
  })

  it('strips surrounding whitespace', () => {
    expect(normalizeTableCode('  KXTP \n')).toBe('KXTP')
  })

  it('rejects the wrong length', () => {
    expect(normalizeTableCode('KXT')).toBeNull()
    expect(normalizeTableCode('KXTPQ')).toBeNull()
  })

  it('rejects ambiguous characters rather than guessing', () => {
    expect(normalizeTableCode('KXTO')).toBeNull()
    expect(normalizeTableCode('KXT0')).toBeNull()
  })

  it('rejects an empty string', () => {
    expect(normalizeTableCode('')).toBeNull()
  })
})
