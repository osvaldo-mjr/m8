import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * These run the guard as a real subprocess, the way `npm run guard:size`
 * does. `check-tv-size.mjs` had the same main-module bug as the syntax
 * guard — `import.meta.url === \`file://${process.argv[1]}\`` never matches
 * on Windows, so `main()` silently never ran and the process exited 0 having
 * measured nothing. A subprocess test asserting on real output is what
 * catches that; calling internal functions in-process would skip the CLI
 * entrypoint entirely and miss it.
 *
 * The "passes" case asserts on stdout content (a byte total), not just exit
 * code 0, for the same reason: exit 0 with no output is exactly what the
 * broken entrypoint produced.
 */
describe('the guard script (subprocess)', () => {
  const scriptPath = fileURLToPath(new URL('./check-tv-size.mjs', import.meta.url))
  const repoRoot = fileURLToPath(new URL('..', import.meta.url))

  function runGuard(targetDir?: string, budgetBytes?: number) {
    const args = [scriptPath]
    if (targetDir !== undefined) args.push(targetDir)
    if (budgetBytes !== undefined) args.push(String(budgetBytes))
    return spawnSync(process.execPath, args, { cwd: repoRoot, encoding: 'utf8' })
  }

  /**
   * Deterministic bytes that gzip barely at all, so a fixture can be made
   * reliably larger than the real budget without depending on Math.random.
   */
  function incompressible(length: number): string {
    const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/'
    // xorshift32, kept in 32-bit integer arithmetic throughout: a plain
    // multiplicative generator overflows JavaScript's safe integer range and
    // degenerates into a short cycle, which gzip then compresses away — the
    // opposite of what this fixture needs.
    let state = 0x9e37_79b9
    let out = ''
    for (let i = 0; i < length; i += 1) {
      state ^= state << 13
      state >>>= 0
      state ^= state >>> 17
      state ^= state << 5
      state >>>= 0
      out += alphabet[state % alphabet.length]
    }
    return out
  }

  function makeFixtureDir(files: Record<string, string>): string {
    const dir = mkdtempSync(join(tmpdir(), 'm8-tv-size-'))
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(join(dir, name), content)
    }
    return dir
  }

  it('exits 0 against a valid build and reports the gzipped byte total', () => {
    const dir = makeFixtureDir({ 'main.js': 'console.log("tv")', 'main.css': 'body { color: red }' })
    try {
      const result = runGuard(dir)
      expect(result.status).toBe(0)
      expect(result.stdout).toMatch(/Total: \d+ B gzipped\. Budget: \d+ B\./)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('exits non-zero when the bundle exceeds the budget, and says by how much', () => {
    // The rejection path itself, end to end. Everything else here pins what
    // the guard does when it passes; a size guard whose failure is never
    // exercised is indistinguishable from no guard at all.
    const dir = makeFixtureDir({ 'main.js': 'console.log("tv")', 'main.css': 'body { color: red }' })
    try {
      const result = runGuard(dir, 1)
      expect(result.status).not.toBe(0)
      expect(result.stderr).toMatch(/over budget/)
      expect(result.stdout).toContain('Budget: 1 B.')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('exits 0 when the same bundle is measured against a budget it fits', () => {
    // The mirror of the case above, against the same fixture: what decides
    // is the ceiling, not something incidental to the files.
    const dir = makeFixtureDir({ 'main.js': 'console.log("tv")', 'main.css': 'body { color: red }' })
    try {
      const result = runGuard(dir, 1_000_000)
      expect(result.status).toBe(0)
      expect(result.stdout).toContain('Budget: 1000000 B.')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('exits non-zero on a budget override that is not a positive whole number of bytes', () => {
    const dir = makeFixtureDir({ 'main.js': 'console.log("tv")', 'main.css': 'body { color: red }' })
    try {
      const result = spawnSync(process.execPath, [scriptPath, dir, 'lots'], {
        cwd: repoRoot,
        encoding: 'utf8',
      })
      expect(result.status).not.toBe(0)
      expect(result.stderr).toMatch(/Budget override/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('cannot be loosened by an environment variable', () => {
    // A ceiling that the environment can raise is not a ceiling. The CLI
    // override stays — a test has to be able to drive the rejection path —
    // but it is an argument the guard's own caller passes, visible in the
    // command, and `npm run guard:size` passes none. An environment variable
    // is invisible at the call site and would let any CI job quietly opt out
    // of the budget the television actually has to live within.
    const dir = makeFixtureDir({ 'main.js': incompressible(60_000), 'main.css': 'body{color:red}' })
    try {
      const result = spawnSync(process.execPath, [scriptPath, dir], {
        cwd: repoRoot,
        encoding: 'utf8',
        env: { ...process.env, M8_TV_BUDGET_BYTES: '999999999' },
      })
      expect(result.status).not.toBe(0)
      expect(result.stderr).toMatch(/over budget/)
      // The real budget governed, not the one the environment asked for.
      expect(result.stdout).not.toContain('999999999')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('exits non-zero when the target directory does not exist', () => {
    const dir = mkdtempSync(join(tmpdir(), 'm8-tv-size-'))
    rmSync(dir, { recursive: true, force: true }) // now a guaranteed-unused, guaranteed-missing path
    const result = runGuard(dir)
    expect(result.status).not.toBe(0)
    // Depend on output, not only the exit code, so a crash for an unrelated
    // reason cannot masquerade as correctly rejecting a missing build.
    expect(result.stderr).toMatch(/ENOENT/)
    expect(result.stderr).toContain(dir)
  })

  it('exits non-zero when the target directory exists but is empty', () => {
    const dir = makeFixtureDir({})
    try {
      const result = runGuard(dir)
      expect(result.status).not.toBe(0)
      expect(result.stderr).toMatch(/No JavaScript and no CSS found/)
      expect(result.stderr).toContain('Run the build first')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('exits non-zero when CSS built but JavaScript did not — one asset kind is not a build', () => {
    const dir = makeFixtureDir({ 'main.css': 'body { color: red }' })
    try {
      const result = runGuard(dir)
      expect(result.status).not.toBe(0)
      expect(result.stderr).toMatch(/No JavaScript found/)
      // Must not also claim CSS is missing — CSS is right there.
      expect(result.stderr).not.toMatch(/No CSS/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('exits non-zero when JavaScript built but CSS did not', () => {
    const dir = makeFixtureDir({ 'main.js': 'console.log("tv")' })
    try {
      const result = runGuard(dir)
      expect(result.status).not.toBe(0)
      expect(result.stderr).toMatch(/No CSS found/)
      expect(result.stderr).not.toMatch(/No JavaScript/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
