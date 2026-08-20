import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parse } from 'acorn'

const TV_DIST = 'apps/tv/dist'

/**
 * Parses with an ES2017 grammar. Anything newer is a syntax error, which is
 * exactly the signal we want: a 2020 television would fail the same way, but
 * in a living room instead of in CI.
 *
 * This must stay a real parse, never a text search. A text search for `?.`
 * matches `a?.5:b` — a ternary whose consequent is the fractional literal
 * `.5` — which is legal ES2017 and not optional chaining at all. Only a
 * grammar tells the two apart.
 */
export function assertEs2017(source, label) {
  try {
    parse(source, { ecmaVersion: 2017, sourceType: 'module' })
  } catch (error) {
    throw new Error(`${label} is not ES2017: ${error.message}`)
  }
}

function jsFiles(dir) {
  const found = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...jsFiles(path))
    else if (entry.name.endsWith('.js')) found.push(path)
  }
  return found
}

function main() {
  const files = jsFiles(TV_DIST)
  if (files.length === 0) {
    throw new Error(`No JavaScript found in ${TV_DIST}. Run the build first.`)
  }
  for (const file of files) {
    assertEs2017(readFileSync(file, 'utf8'), file)
  }
  console.log(`ES2017 syntax check passed for ${files.length} file(s).`)
}

// `process.argv[1]` is not guaranteed to be an absolute path (it can be
// relative, e.g. under npm on Windows), so compare via `pathToFileURL`
// rather than string-concatenating a `file://` prefix onto it — the naive
// comparison silently never matches there, and `main()` never runs.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
