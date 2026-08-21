/**
 * Types for `tailwind.config.js`, which stays JavaScript because that is what
 * Tailwind's own CLI and the PostCSS plugin load. Declared here — the same
 * pattern as `scripts/check-tv-syntax.d.mts` — so the configuration can be
 * imported by a test and asserted on, rather than only being trusted.
 */
declare const config: {
  readonly content: readonly string[]
  readonly corePlugins: { readonly preflight: boolean }
  readonly theme: { readonly extend: { readonly colors: Record<string, unknown> } }
  readonly plugins: readonly unknown[]
}

export default config
