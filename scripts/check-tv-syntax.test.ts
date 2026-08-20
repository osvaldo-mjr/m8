import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { assertEs2017 } from './check-tv-syntax.mjs'

describe('assertEs2017', () => {
  it('accepts ES2017 syntax', () => {
    expect(() => assertEs2017('async function f() { await 1 }', 'ok.js')).not.toThrow()
  })

  it('accepts a ternary followed by a fractional literal, not optional chaining', () => {
    // Minified code can produce `a?.5:b` — a ternary whose consequent is `.5`.
    // A text search for `?.` would flag this; a real ES2017 grammar does not.
    expect(() => assertEs2017('const x = a?.5:b', 'ok.js')).not.toThrow()
  })

  it('rejects optional chaining', () => {
    expect(() => assertEs2017('const x = a?.b', 'bad.js')).toThrow(/bad\.js/)
  })

  it('rejects nullish coalescing', () => {
    expect(() => assertEs2017('const x = a ?? b', 'bad.js')).toThrow(/bad\.js/)
  })

  it('rejects class private fields', () => {
    expect(() => assertEs2017('class A { #x = 1 }', 'bad.js')).toThrow(/bad\.js/)
  })
})

/**
 * These run the guard as a real subprocess, the way `npm run guard:syntax`
 * does, rather than calling its exported function directly. That distinction
 * matters: this guard once had a main-module check
 * (`import.meta.url === \`file://${process.argv[1]}\``) that could never be
 * true on Windows — a relative or backslashed `argv[1]` never forms a valid
 * `file://` URL by string concatenation — so `main()` silently never ran and
 * the process exited 0 having inspected nothing. Calling `assertEs2017`
 * in-process, as the tests above do, cannot catch that class of bug, because
 * it never goes through the CLI entrypoint at all. Only a subprocess check
 * that inspects real output can.
 *
 * The "passes" case asserts on stdout content (a file count), not just exit
 * code 0, for the same reason: exit 0 with no output is exactly what the
 * broken entrypoint produced.
 */
describe('the guard script (subprocess)', () => {
  const scriptPath = fileURLToPath(new URL('./check-tv-syntax.mjs', import.meta.url))
  const repoRoot = fileURLToPath(new URL('..', import.meta.url))

  function runGuard(targetDir?: string) {
    const args = targetDir === undefined ? [scriptPath] : [scriptPath, targetDir]
    return spawnSync(process.execPath, args, { cwd: repoRoot, encoding: 'utf8' })
  }

  function makeFixtureDir(files: Record<string, string>): string {
    const dir = mkdtempSync(join(tmpdir(), 'm8-tv-syntax-'))
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(join(dir, name), content)
    }
    return dir
  }

  it('exits 0 against a valid ES2017 build and reports how many files it inspected', () => {
    const dir = makeFixtureDir({ 'main.js': 'console.log("tv")' })
    try {
      const result = runGuard(dir)
      expect(result.status).toBe(0)
      expect(result.stdout).toMatch(/ES2017 syntax check passed for 1 file\(s\)\./)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('exits non-zero when the target directory does not exist', () => {
    const dir = mkdtempSync(join(tmpdir(), 'm8-tv-syntax-'))
    rmSync(dir, { recursive: true, force: true }) // now a guaranteed-unused, guaranteed-missing path
    const result = runGuard(dir)
    expect(result.status).not.toBe(0)
    // Depend on output, not only the exit code, so a crash for an unrelated
    // reason cannot masquerade as correctly rejecting a missing build.
    expect(result.stderr).toMatch(/ENOENT/)
    expect(result.stderr).toContain(dir)
  })

  it('exits non-zero when the target directory exists but has no JavaScript', () => {
    const dir = makeFixtureDir({})
    try {
      const result = runGuard(dir)
      expect(result.status).not.toBe(0)
      expect(result.stderr).toMatch(/No JavaScript found/)
      expect(result.stderr).toContain('Run the build first')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('exits non-zero when the built JavaScript uses syntax the target TV cannot run', () => {
    const dir = makeFixtureDir({ 'main.js': 'const x = a?.b' })
    try {
      const result = runGuard(dir)
      expect(result.status).not.toBe(0)
      expect(result.stderr).toMatch(/is not ES2017/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
