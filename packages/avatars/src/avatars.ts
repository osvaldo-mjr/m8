/**
 * The fixed avatar catalogue. No uploads: a fixed set is what makes an avatar
 * legible from three metres and keeps a stranger's picture off a television in
 * someone's living room.
 *
 * It lives in a package of its own because three different places need it and
 * none of them may import each other: the phone offers the choice, the large
 * screen draws it, and the domain decides whether an id is one at all. It is
 * not in `@m8/protocol` — a glyph is not wire vocabulary — and not in
 * `@m8/core`, which the phone must never import.
 */
export interface Avatar {
  readonly id: string
  readonly glyph: string
}

export const AVATARS: readonly Avatar[] = [
  { id: 'fox', glyph: '🦊' },
  { id: 'owl', glyph: '🦉' },
  { id: 'cat', glyph: '🐱' },
  { id: 'frog', glyph: '🐸' },
  { id: 'bear', glyph: '🐻' },
  { id: 'crab', glyph: '🦀' },
]

/** True only for an id in the catalogue. Everything else is not an avatar. */
export function isAvatarId(value: string): boolean {
  return AVATARS.some((avatar) => avatar.id === value)
}

/**
 * The glyph for an id, or null when the id names no avatar — including the
 * sentinel a participant carries before choosing one. A caller that has to
 * draw something decides what "no avatar" looks like; this does not guess.
 */
export function avatarGlyph(id: string): string | null {
  for (const avatar of AVATARS) {
    if (avatar.id === id) return avatar.glyph
  }
  return null
}
