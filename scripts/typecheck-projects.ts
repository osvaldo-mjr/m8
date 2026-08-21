/**
 * Pure parsing for the arrangement that keeps every workspace typechecked.
 *
 * The root program no longer covers `apps/tv/src` or `apps/phone/src`: each
 * browser app has its own project, and the only thing that runs them is the
 * `typecheck` script in package.json. That makes a string in a manifest
 * load-bearing — delete `&& tsc -p apps/tv` and the large screen is
 * typechecked by nothing at all, since `vite build` does not typecheck and
 * neither does vitest, and everything else stays green. Worse than before the
 * split, when the root program at least covered it by default.
 *
 * Kept separate from disk access so the parsing can be exercised with plain
 * strings, the same shape as `scripts/node-version.ts`.
 */

/**
 * The projects a typecheck command runs, in order. Reads `tsc -p <path>` and
 * `tsc --project <path>`; a bare `tsc` with no project is the root program
 * and is not one of these.
 */
export function projectsIn(script: string): string[] {
  const found: string[] = []
  const pattern = /\btsc\s+(?:[^&|]*?\s)?(?:-p|--project)\s+(\S+)/g
  for (const match of script.matchAll(pattern)) {
    const project = match[1]
    if (project !== undefined) found.push(project)
  }
  return found
}

/** True when a bare `tsc` — the root program, no `-p` — is among the commands. */
export function runsRootProgram(script: string): boolean {
  return script
    .split('&&')
    .some((command) => /\btsc\b/.test(command) && !/(?:-p|--project)\s/.test(command))
}

/**
 * The newest ECMAScript library named in a `lib` list, as a year: `ES2017`
 * gives 2017. `ESNext` gives Infinity, because it is by definition newer than
 * anything nameable. `ES6` is 2015 under its other name, `ES5` is 5, and
 * non-ECMAScript entries such as `DOM` are ignored.
 *
 * Returned rather than compared here so a caller can say what its own ceiling
 * is; nothing about "2017" belongs in a parsing function.
 */
export function newestEcmaScriptLib(lib: readonly string[]): number | undefined {
  let newest: number | undefined
  for (const entry of lib) {
    const match = /^es(next|\d+)$/i.exec(entry)
    if (match === null) continue
    const token = match[1]?.toLowerCase()
    if (token === undefined) continue
    const year = token === 'next' ? Number.POSITIVE_INFINITY : normalizeEdition(Number(token))
    if (newest === undefined || year > newest) newest = year
  }
  return newest
}

/** `ES6` and `ES2015` are the same edition under two names. */
function normalizeEdition(edition: number): number {
  return edition === 6 ? 2015 : edition
}
