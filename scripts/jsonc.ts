/**
 * Just enough JSONC to read this repository's own configuration files.
 *
 * `tsconfig.json` and its per-app siblings carry the comments that explain
 * them, so a test that wants to assert on their contents cannot use
 * `JSON.parse` directly. TypeScript used to expose its own parser for this,
 * but the native compiler (7.x) publishes nothing beyond `version` from its
 * JavaScript package, so there is no borrowing it.
 *
 * Hand-written rather than adding a dependency, in the same spirit as the
 * hand-written wire validator: it is twenty lines, and the alternative is a
 * package in the tree for one function.
 *
 * Comments only. Trailing commas — which tsconfig also tolerates — are not
 * handled, because none of the files this reads use them and silently
 * accepting more than we test for is how a parser starts lying.
 */
export function stripJsonComments(source: string): string {
  let out = ''
  let index = 0
  let inString = false

  while (index < source.length) {
    const char = source[index] as string
    const next = source[index + 1]

    if (inString) {
      // A backslash escapes whatever follows, including a quote, so both
      // characters are copied before the loop can look at the second one.
      if (char === '\\' && next !== undefined) {
        out += char + next
        index += 2
        continue
      }
      if (char === '"') inString = false
      out += char
      index += 1
      continue
    }

    if (char === '"') {
      inString = true
      out += char
      index += 1
      continue
    }

    if (char === '/' && next === '/') {
      while (index < source.length && source[index] !== '\n') index += 1
      continue
    }

    if (char === '/' && next === '*') {
      index += 2
      while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) {
        index += 1
      }
      index += 2
      continue
    }

    out += char
    index += 1
  }

  return out
}

/** Parses JSON that may carry comments. */
export function parseJsonc(source: string): unknown {
  return JSON.parse(stripJsonComments(source))
}
