/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.ts'],
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
