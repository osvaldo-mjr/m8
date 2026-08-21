import { fileURLToPath } from 'node:url'
import fastGlob from 'fast-glob'
import { describe, expect, it } from 'vitest'
import tvConfig from '../apps/tv/tailwind.config.js'

const tvRoot = fileURLToPath(new URL('../apps/tv', import.meta.url))

/**
 * Tailwind's own configuration for the large screen, asserted rather than
 * commented.
 *
 * Both facts below were carried by comments alone before this file existed.
 * A comment is a good explanation and a poor guard: it does not fail.
 */
describe('the large screen Tailwind configuration', () => {
  it('keeps preflight switched off', () => {
    // Preflight emits `[hidden]:where(:not([hidden=until-found]))`, and
    // `:where()` is Chromium 88 against a declared floor of 68 — an old set
    // discards the whole rule rather than the part it cannot parse. Nothing
    // on this screen uses `[hidden]`, so switching preflight back on would
    // put a Chromium 88 selector on the television and change nothing
    // visible, which is exactly the kind of change nobody notices. The reset
    // this screen needs is written out in `apps/tv/src/styles.css`.
    //
    // `scripts/check-tv-css.mjs` catches the emitted selector as well. This
    // catches the decision, which is a better error message.
    expect(tvConfig.corePlugins.preflight).toBe(false)
  })

  describe('the content the scanner is shown', () => {
    // Resolved with the same library Tailwind resolves them with, so this
    // agrees with Tailwind about what a negated pattern means rather than
    // asserting on the strings and hoping.
    // fast-glob echoes back the `./` the patterns are written with, so the
    // paths are normalised and the assertions can read as paths rather than
    // as pattern spelling.
    const scanned = fastGlob
      .sync([...tvConfig.content], { cwd: tvRoot })
      .map((path) => path.replace(/^\.\//, ''))
      .sort()

    it('includes the screen itself', () => {
      expect(scanned).toContain('src/render.ts')
      expect(scanned).toContain('index.html')
    })

    it('excludes the tests', () => {
      // Tailwind decides which utilities to emit by looking for candidate
      // class names in raw text, so it cannot tell a class from any other
      // word. `p-1`, `p-2` and `p-3` are participant ids in `render.test.ts`,
      // and `contents` and `lowercase` come out of prose in the tests — and
      // every one of them shipped to the television as a real rule in the
      // real stylesheet, costing bytes off a budget and adding selectors to
      // the CSS guard's surface for classes nothing renders.
      expect(scanned.filter((path) => path.endsWith('.test.ts'))).toEqual([])
    })

    it('finds the tests it is meant to be excluding', () => {
      // Guards the guard: if `apps/tv/src` held no test files at all, the
      // assertion above would pass for the wrong reason for ever.
      expect(fastGlob.sync('src/**/*.test.ts', { cwd: tvRoot }).length).toBeGreaterThan(0)
    })
  })
})
