import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The ceiling lives in `budget.json` and is read by name from
 * `check-tv-size.mjs`. `budget.json` also holds `gameAssetRawBytes`, the
 * independent per-game asset ceiling `check-game-assets.mjs` reads (see
 * `check-game-assets.test.ts`) — the two keys are declared side by side but
 * checked separately, so a rename that touched one guard's key would read
 * `undefined`, compare `NaN` against its total, find it not greater, and
 * pass every bundle from then on. The guard refuses a budget it cannot read,
 * and this is what would notice.
 */
describe('the declared budget', () => {
  const repoRoot = fileURLToPath(new URL('..', import.meta.url))
  const budget = JSON.parse(readFileSync(join(repoRoot, 'budget.json'), 'utf8')) as Record<
    string,
    unknown
  >
  const guardSource = readFileSync(join(repoRoot, 'scripts', 'check-tv-size.mjs'), 'utf8')
  const BUDGET_KEY = 'tvBundleTransferBytes'

  // This is the one assertion in the whole suite that would catch a third
  // key arriving in `budget.json` with no guard reading it — a budget file
  // growing an unenforced key looks like protection and is not, and that is
  // exactly the failure this task exists to prevent. Deliberately a literal,
  // hardcoded list rather than something derived from the guard scripts on
  // disk: deriving it would let a new key that no guard reads slip through
  // silently, which is the one thing this test must not do. A new key is
  // meant to break this line and force a deliberate update here.
  it('declares no keys beyond the ones the guards read', () => {
    expect(Object.keys(budget).sort()).toEqual(['gameAssetRawBytes', 'tvBundleTransferBytes'])
  })

  it('declares it under the key the guard reads', () => {
    expect(guardSource).toContain(`const BUDGET_KEY = '${BUDGET_KEY}'`)
  })

  it('declares it as a positive whole number of bytes', () => {
    const value = budget[BUDGET_KEY]
    expect(Number.isInteger(value)).toBe(true)
    expect(value as number).toBeGreaterThan(0)
  })
})

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

  it('exits 0 against a valid build and reports the byte total', () => {
    const dir = makeFixtureDir({ 'main.js': 'console.log("tv")', 'main.css': 'body { color: red }' })
    try {
      const result = runGuard(dir)
      expect(result.status).toBe(0)
      // "transferred", not "gzipped": the total now mixes gzipped text with
      // fonts measured raw, because nothing gzips a woff2 a second time on
      // the way out and calling that figure gzipped would be a small lie in
      // the one line anybody reads.
      expect(result.stdout).toMatch(/Total: \d+ B transferred\. Budget: \d+ B\./)
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
    const dir = makeFixtureDir({ 'main.js': incompressible(120_000), 'main.css': 'body{color:red}' })
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

  it('counts the fonts the screen self-hosts', () => {
    // The hole this closes: the guard matched `.js` and `.css` only, so the
    // two woff2 files the television now downloads were invisible to it —
    // the bundle would be reported as comfortably within budget while the
    // set fetched twenty kilobytes more. A budget that cannot see the
    // heaviest asset in the build is not a budget.
    const font = incompressible(20_000)
    const withoutFont = makeFixtureDir({ 'main.js': 'console.log("tv")', 'main.css': 'body{}' })
    const withFont = makeFixtureDir({
      'main.js': 'console.log("tv")',
      'main.css': 'body{}',
      'archivo.woff2': font,
    })
    try {
      const baseline = Number(/Total: (\d+) B/.exec(runGuard(withoutFont).stdout)?.[1])
      const result = runGuard(withFont)
      const total = Number(/Total: (\d+) B/.exec(result.stdout)?.[1])

      expect(result.stdout).toContain('archivo.woff2')
      expect(total - baseline).toBe(font.length)
    } finally {
      rmSync(withoutFont, { recursive: true, force: true })
      rmSync(withFont, { recursive: true, force: true })
    }
  })

  it('measures a font raw, because nothing gzips a woff2 a second time', () => {
    // Fonts carry their own compression. Reporting a gzipped figure for one
    // would understate what the television actually fetches, which is the
    // same defect as not measuring it at all, only harder to see.
    const font = 'x'.repeat(50_000) // gzips to almost nothing; raw is 50 kB
    const dir = makeFixtureDir({
      'main.js': 'console.log("tv")',
      'main.css': 'body{}',
      'archivo.woff2': font,
    })
    try {
      const result = runGuard(dir, 1_000_000)
      expect(result.stdout).toMatch(/archivo\.woff2: 50000 B raw/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('exits non-zero when a font alone blows the budget', () => {
    const dir = makeFixtureDir({
      'main.js': 'console.log("tv")',
      'main.css': 'body{}',
      'archivo.woff2': incompressible(40_000),
    })
    try {
      const result = runGuard(dir, 1_000)
      expect(result.status).not.toBe(0)
      expect(result.stderr).toMatch(/over budget/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('does not accept a font in place of the bundle', () => {
    // A build that emitted fonts and nothing else is not a build, and the
    // fonts must not make the directory look plausibly populated.
    const dir = makeFixtureDir({ 'archivo.woff2': incompressible(1_000) })
    try {
      const result = runGuard(dir)
      expect(result.status).not.toBe(0)
      expect(result.stderr).toMatch(/No JavaScript and no CSS found/)
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
