import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const TV_DIST = 'apps/tv/dist'

/** The oldest Chromium the large screen claims to support. */
export const TV_CHROMIUM_FLOOR = 68

/**
 * A declaration's property is at the start of a declaration: right after the
 * `{` that opened the block or the `;` that closed the one before it. Written
 * that way rather than as "preceded by whitespace" for one specific reason —
 * `--m8-safe-inset`, `--m8-piece-gap`, `--m8-chip-gap` and `--tw-ring-inset`
 * are all real custom property *names* in the stylesheet this guard reads,
 * and every one of them ends in a banned property's spelling. A looser match
 * fails the build on the names invented to avoid the properties.
 */
function property(name) {
  return new RegExp(`(?:^|[{;])\\s*${name}\\s*:`)
}

/** A CSS function call, not a word that merely ends in one. `minmax(` is not `max(`. */
function fn(name) {
  return new RegExp(`(?:^|[^-\\w])${name}\\(`)
}

/**
 * A functional pseudo-class. The leading colon anchors it on its own, and it
 * has to: a selector is written `.a:is(.b)`, so the character before the colon
 * belongs to the selector and the rule `fn` applies would never match.
 */
function pseudo(name) {
  return new RegExp(`:${name}\\(`)
}

/**
 * What a 2020 television cannot run, and when each one arrived.
 *
 * The point of the list is the ones nobody wrote. The stylesheet this guard
 * reads contains selectors and declarations no author of this repository
 * typed — `::backdrop`, `::-ms-backdrop`, `.transform`, `.outline` — because
 * Tailwind emits them from whatever it found in the source. Tailwind v3's own
 * preflight emits `[hidden]:where(:not([hidden=until-found]))`, and `:where()`
 * is Chromium 88: an old set does not ignore the part of a selector it cannot
 * parse, it discards the whole rule. Preflight is switched off for exactly
 * that reason — but that switch is a line in a configuration file, and a
 * Tailwind minor bump is a live route to the next such selector arriving in
 * the bundle with nothing in the diff to see.
 *
 * The Tailwind v4 constructs are here for the same reason from the other
 * direction: v4 needs Chrome 111, and `@layer`, `oklch()`, `color-mix()` and
 * `@property` are what it would announce itself with if `apps/tv` were ever
 * moved onto it by a well-meaning dependency update.
 */
export const UNSUPPORTED_CSS = [
  { what: ':is()', since: 88, pattern: pseudo('is') },
  { what: ':where()', since: 88, pattern: pseudo('where') },
  { what: ':has()', since: 105, pattern: pseudo('has') },
  { what: ':focus-visible', since: 86, pattern: /:focus-visible/ },
  { what: 'clamp()', since: 79, pattern: fn('clamp') },
  { what: 'min()', since: 79, pattern: fn('min') },
  { what: 'max()', since: 79, pattern: fn('max') },
  { what: 'color-mix()', since: 111, pattern: fn('color-mix') },
  { what: 'oklch()', since: 111, pattern: fn('oklch') },
  { what: 'oklab()', since: 111, pattern: fn('oklab') },
  { what: 'lch()', since: 111, pattern: fn('lch') },
  { what: 'lab()', since: 111, pattern: fn('lab') },
  { what: 'aspect-ratio', since: 88, pattern: property('aspect-ratio') },
  { what: 'backdrop-filter', since: 76, pattern: property('backdrop-filter') },
  // Chromium 84 in flexbox. It has worked in grid since 66, but this screen
  // spaces everything with margins on purpose: the distinction is a trap, and
  // changing a `grid` to a `flex` later would silently lose every space on
  // the television with nothing in the diff connecting cause to effect.
  { what: 'gap', since: 84, pattern: property('gap') },
  { what: 'row-gap', since: 84, pattern: property('row-gap') },
  { what: 'column-gap', since: 84, pattern: property('column-gap') },
  { what: 'inset', since: 87, pattern: property('inset') },
  { what: 'overflow: clip', since: 90, pattern: /(?:^|[{;])\s*overflow(?:-[xy])?\s*:\s*clip/ },
  { what: '@layer', since: 99, pattern: /@layer[\s{]/ },
  { what: '@container', since: 105, pattern: /@container[\s(]/ },
  { what: '@property', since: 85, pattern: /@property[\s(]/ },
  { what: 'viewport-relative units (dvh, svh, lvh and their kind)', since: 108, pattern: /\d(?:d|s|l)v(?:h|w|min|max)\b/ },
]

/**
 * Comments are removed before anything is looked for, and this is load
 * bearing rather than an optimisation. `apps/tv/src/styles.css` explains at
 * length, in comments, that it uses no `clamp()`, no `:where()`, no
 * `aspect-ratio` and no `gap` — so a guard that reads an unminified
 * stylesheet would fail the build on the paragraph describing why the build
 * should pass.
 */
export function stripCssComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ')
}

/**
 * Everything in `source` the target cannot run, in the order declared.
 *
 * A text scan, not a parse, and deliberately so: what has to be caught is a
 * selector or a declaration arriving from a dependency, and both are visible
 * in the text. The cost of the choice is paid in the two helpers above, which
 * is where every false positive this has produced was fixed.
 */
export function findUnsupportedCss(source) {
  const text = stripCssComments(source)
  const found = []
  for (const construct of UNSUPPORTED_CSS) {
    const match = text.match(construct.pattern)
    if (match !== null) found.push({ what: construct.what, since: construct.since, sample: match[0].trim() })
  }
  return found
}

/**
 * Throws if `source` contains anything the oldest supported television cannot
 * run, naming every finding rather than only the first: a Tailwind bump that
 * introduces one construct usually introduces several, and fixing them one
 * build at a time is how a guard becomes something people route around.
 */
export function assertTvCss(source, label) {
  const found = findUnsupportedCss(source)
  if (found.length === 0) return
  const lines = found.map(
    (item) => `  ${item.what} (Chromium ${item.since}), as \`${item.sample}\``,
  )
  throw new Error(
    `${label} uses CSS a Chromium ${TV_CHROMIUM_FLOOR} television cannot run:\n${lines.join('\n')}`,
  )
}

function cssFiles(dir) {
  const found = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...cssFiles(path))
    else if (entry.name.endsWith('.css')) found.push(path)
  }
  return found
}

// `tvDist` is overridable via a CLI argument (`process.argv[2]`) so tests can
// point the guard at a disposable fixture directory instead of the real
// `apps/tv/dist`. `npm run guard:css` passes no argument, so the default still
// governs normal use.
function main(tvDist) {
  const files = cssFiles(tvDist)
  if (files.length === 0) {
    throw new Error(`No CSS found in ${tvDist}. Run the build first.`)
  }
  for (const file of files) {
    assertTvCss(readFileSync(file, 'utf8'), file)
  }
  console.log(`Chromium ${TV_CHROMIUM_FLOOR} CSS check passed for ${files.length} file(s).`)
}

// `process.argv[1]` is not guaranteed to be an absolute path (it can be
// relative, e.g. under npm on Windows), so compare via `pathToFileURL` rather
// than string-concatenating a `file://` prefix onto it — the naive comparison
// silently never matches there, and `main()` never runs.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv[2] ?? TV_DIST)
}
