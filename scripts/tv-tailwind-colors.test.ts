import builtInColors from 'tailwindcss/colors'
import { describe, expect, it } from 'vitest'
import tvConfig from '../apps/tv/tailwind.config.js'

/**
 * A colour declared under `theme.extend.colors` does not merge with a
 * built-in palette of the same name — it replaces it outright. Naming a
 * single flat colour `slate` therefore deleted Tailwind's own
 * `slate-50…slate-950`, so `text-slate-400` and every sibling silently
 * stopped being a class at all: no error, no warning, no style.
 *
 * Nothing was using those classes when this was found, which is precisely
 * why it needed a test rather than a fix alone — the failure mode is a
 * missing style on a television nobody is standing in front of.
 */
describe('the large screen colour tokens', () => {
  const tokens = Object.keys(tvConfig.theme.extend.colors)
  const reserved = new Set(Object.keys(builtInColors))

  it('finds the tokens it is meant to check', () => {
    // Guards the guard: an empty list would make the assertion below vacuous.
    expect(tokens.length).toBeGreaterThan(0)
  })

  it.each(tokens)('does not shadow a built-in Tailwind palette with %s', (token) => {
    expect(reserved.has(token)).toBe(false)
  })
})
