import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseJsonc } from './jsonc.js'
import { newestEcmaScriptLib, projectsIn, runsRootProgram } from './typecheck-projects.js'

describe('projectsIn', () => {
  it('finds nothing in a command that only runs the root program', () => {
    expect(projectsIn('tsc --noEmit')).toEqual([])
  })

  it('reads a project off -p', () => {
    expect(projectsIn('tsc --noEmit && tsc -p apps/tv')).toEqual(['apps/tv'])
  })

  it('reads a project off --project', () => {
    expect(projectsIn('tsc --project apps/tv')).toEqual(['apps/tv'])
  })

  it('reads every project in a chain, in order', () => {
    expect(projectsIn('tsc --noEmit && tsc -p apps/tv && tsc -p apps/phone')).toEqual([
      'apps/tv',
      'apps/phone',
    ])
  })
})

describe('runsRootProgram', () => {
  it('is true for a bare tsc', () => {
    expect(runsRootProgram('tsc --noEmit && tsc -p apps/tv')).toBe(true)
  })

  it('is false when every invocation names a project', () => {
    expect(runsRootProgram('tsc -p apps/tv && tsc -p apps/phone')).toBe(false)
  })
})

describe('newestEcmaScriptLib', () => {
  it('ignores libraries that are not ECMAScript editions', () => {
    expect(newestEcmaScriptLib(['ES2017', 'DOM', 'DOM.Iterable'])).toBe(2017)
  })

  it('takes the newest of several', () => {
    expect(newestEcmaScriptLib(['ES2015', 'ES2022', 'ES2017'])).toBe(2022)
  })

  it('treats ES6 as the edition it is', () => {
    expect(newestEcmaScriptLib(['ES6'])).toBe(2015)
  })

  it('treats ESNext as newer than anything nameable', () => {
    expect(newestEcmaScriptLib(['ES2017', 'ESNext'])).toBe(Number.POSITIVE_INFINITY)
  })

  it('is undefined when no ECMAScript library is named at all', () => {
    expect(newestEcmaScriptLib(['DOM'])).toBeUndefined()
  })
})

/**
 * The arrangement itself, against the real files.
 *
 * Two things have to stay true together, and neither is visible from the
 * other: a project's sources are excluded from the root program, *and* the
 * typecheck script runs that project. Drop the second and the first turns
 * from a narrowing into a hole — the large screen would be typechecked by
 * nothing, with `npm ci`, the whole suite, both guards and `docker build` all
 * still green.
 */
const repoRoot = fileURLToPath(new URL('..', import.meta.url))

// The tsconfig files carry the comments that explain themselves, so they are
// JSONC rather than JSON.
function readConfig(relative: string): Record<string, unknown> {
  return parseJsonc(readFileSync(join(repoRoot, relative), 'utf8')) as Record<string, unknown>
}

/** Every app that has taken itself out of the root program by having its own project. */
function appsWithOwnProject(): string[] {
  const apps = join(repoRoot, 'apps')
  return readdirSync(apps, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(apps, entry.name, 'tsconfig.json')))
    .map((entry) => `apps/${entry.name}`)
}

describe('every workspace stays typechecked by something', () => {
  const script = String((readConfig('package.json')['scripts'] as Record<string, string>)['typecheck'])
  const rootExclude = (readConfig('tsconfig.json')['exclude'] ?? []) as string[]
  const projects = appsWithOwnProject()

  it('finds the projects it is meant to check', () => {
    // Guards the guard: a scan that found nothing would make every case below
    // vacuously true, and apps/tv is the one this whole arrangement exists for.
    expect(projects).toContain('apps/tv')
  })

  it('still runs the root program', () => {
    expect(runsRootProgram(script)).toBe(true)
  })

  it.each(appsWithOwnProject())('runs %s from the typecheck script', (project) => {
    expect(projectsIn(script)).toContain(project)
  })

  it.each(appsWithOwnProject())('keeps %s/src out of the root program', (project) => {
    // Otherwise it is checked twice, and the looser root program passing first
    // is what would hide a narrowing that the project's own options impose.
    expect(rootExclude).toContain(`${project}/src`)
  })
})

describe("the large screen's libraries stay narrow", () => {
  it('names no ECMAScript library newer than ES2017', () => {
    const options = readConfig('apps/tv/tsconfig.json')['compilerOptions'] as { lib?: string[] }
    const lib = options.lib ?? []

    // ES2017 is not a preference. It is Chromium 68 to 79, which is what
    // Samsung Tizen and LG webOS sets up to about five years old run.
    expect(newestEcmaScriptLib(lib)).toBe(2017)
  })
})
