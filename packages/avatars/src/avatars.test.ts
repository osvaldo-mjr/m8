import { describe, expect, it } from 'vitest'
import { AVATARS, avatarGlyph, isAvatarId } from './avatars.js'

describe('AVATARS', () => {
  it('has no duplicate ids', () => {
    const ids = AVATARS.map((avatar) => avatar.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('gives every avatar a glyph', () => {
    for (const avatar of AVATARS) {
      expect(avatar.glyph).not.toBe('')
    }
  })

  it('has no duplicate glyphs, since two seats must never look alike', () => {
    const glyphs = AVATARS.map((avatar) => avatar.glyph)
    expect(new Set(glyphs).size).toBe(glyphs.length)
  })
})

describe('isAvatarId', () => {
  it('accepts every id in the catalogue', () => {
    for (const avatar of AVATARS) {
      expect(isAvatarId(avatar.id)).toBe(true)
    }
  })

  it('rejects an id that names no avatar', () => {
    expect(isAvatarId('dragon')).toBe(false)
  })

  it('rejects a long string offered as an id', () => {
    expect(isAvatarId('x'.repeat(120))).toBe(false)
  })

  it('rejects the empty string', () => {
    expect(isAvatarId('')).toBe(false)
  })

  it('rejects the sentinel a participant carries before choosing one', () => {
    expect(isAvatarId('unset')).toBe(false)
  })
})

describe('avatarGlyph', () => {
  it('returns the glyph for a known id', () => {
    const first = AVATARS[0]!
    expect(avatarGlyph(first.id)).toBe(first.glyph)
  })

  it('returns null for an id that names no avatar', () => {
    expect(avatarGlyph('dragon')).toBeNull()
  })

  it('returns null for the sentinel, leaving the caller to decide what to draw', () => {
    expect(avatarGlyph('unset')).toBeNull()
  })
})
