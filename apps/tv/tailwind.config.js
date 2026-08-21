/** @type {import('tailwindcss').Config} */
export default {
  // The scanner is shown the screen, not the tests that exercise it.
  //
  // Tailwind decides which utilities to emit by looking for candidate class
  // names in raw text, so it cannot tell a class from any other word — and
  // `apps/tv/src/*.test.ts` is full of words that happen to be classes.
  // `p-1`, `p-2` and `p-3` are participant ids in `render.test.ts`;
  // `contents` and `lowercase` come out of prose about `textContent` and
  // case-insensitive matching. Every one of them shipped to the television as
  // a real rule in the real stylesheet: bytes off a budget, and selectors on
  // the guard's surface, for classes nothing renders.
  content: ['./index.html', './src/**/*.ts', '!./src/**/*.test.ts'],
  // Tailwind v3's own reset is off, and this screen resets what it needs
  // itself, in `src/styles.css`.
  //
  // Not a preference: preflight emits
  // `[hidden]:where(:not([hidden=until-found]))`, and `:where()` is Chromium
  // 88 against a declared floor of 68. An old television does not ignore the
  // unknown part of that selector — it discards the whole rule. Nothing on
  // this screen uses `[hidden]`, so the visible damage today is none, which
  // is exactly why it would have sat there: the constraint is "no `:is()`,
  // no `:where()` in what the television is sent", and shipping one on the
  // grounds that this particular rule does not matter is how the next one
  // arrives. It also takes about 9 kB of reset off a bundle whose whole
  // point is to be light.
  corePlugins: { preflight: false },
  theme: {
    extend: {
      // Names, never values. Every colour is defined once, in
      // `packages/tokens/tokens.css`, because the phone is on Tailwind v4
      // and this screen is on v3 — a hex written in either config would be a
      // second copy that nothing notices has drifted.
      //
      // None of these may be the name of a built-in Tailwind palette:
      // `theme.extend.colors` replaces a palette of the same name outright
      // rather than merging with it, so calling one of these `violet` would
      // silently delete `violet-50` through `violet-950`.
      // scripts/tv-tailwind-colors.test.ts fails if one ever is.
      colors: {
        ground: 'var(--m8-ground)',
        table: 'var(--m8-table)',
        paper: 'var(--m8-paper)',
        ink: 'var(--m8-ink)',
      },
    },
  },
  plugins: [],
}
