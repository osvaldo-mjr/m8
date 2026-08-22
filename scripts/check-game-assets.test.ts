import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The ceiling lives in `budget.json`, under its own key, independent of the
 * large screen's `tvBundleTransferBytes`. A rename that touched one key but
 * not the guard reading it would read `undefined`, compare `NaN` against a
 * total, find it not greater, and pass every game from then on. The guard
 * refuses a budget it cannot read, and this is what would notice.
 */
describe('the declared budget', () => {
  const repoRoot = fileURLToPath(new URL('..', import.meta.url))
  const budget = JSON.parse(readFileSync(join(repoRoot, 'budget.json'), 'utf8')) as Record<
    string,
    unknown
  >
  const guardSource = readFileSync(join(repoRoot, 'scripts', 'check-game-assets.mjs'), 'utf8')
  const BUDGET_KEY = 'gameAssetRawBytes'

  it('declares it under the key the guard reads', () => {
    expect(guardSource).toContain(`const BUDGET_KEY = '${BUDGET_KEY}'`)
  })

  it('declares it as a positive whole number of bytes', () => {
    const value = budget[BUDGET_KEY]
    expect(Number.isInteger(value)).toBe(true)
    expect(value as number).toBeGreaterThan(0)
  })

  it('is a key distinct from the large-screen bundle budget, so the two cannot collide', () => {
    expect(BUDGET_KEY).not.toBe('tvBundleTransferBytes')
  })
})

/**
 * These run the guard as a real subprocess, the way `npm run guard:assets`
 * does. `check-tv-size.mjs` and `check-tv-syntax.mjs` both once had a
 * main-module check — `import.meta.url === \`file://${process.argv[1]}\`` —
 * that never matches on Windows, so `main()` silently never ran and the
 * process exited 0 having checked nothing. A subprocess test asserting on
 * real output is what catches that; calling internal functions in-process
 * would skip the CLI entrypoint entirely and miss it.
 *
 * The "passes" case asserts on stdout content (a byte total per game), not
 * just exit code 0, for the same reason: exit 0 with no output is exactly
 * what the broken entrypoint produced.
 */
describe('the guard script (subprocess)', () => {
  const scriptPath = fileURLToPath(new URL('./check-game-assets.mjs', import.meta.url))
  const repoRoot = fileURLToPath(new URL('..', import.meta.url))

  function runGuard(gamesRoot?: string, budgetBytes?: number) {
    const args = [scriptPath]
    if (gamesRoot !== undefined) args.push(gamesRoot)
    if (budgetBytes !== undefined) args.push(String(budgetBytes))
    return spawnSync(process.execPath, args, { cwd: repoRoot, encoding: 'utf8' })
  }

  /**
   * A fixture "games root" containing one directory per game, mirroring
   * `packages/games/<id>/assets/`. Passing `null` for a game omits its
   * `assets` directory entirely, to exercise the "no measurable asset" path;
   * passing `{}` creates the directory but leaves it empty, exercising the
   * same failure by a different route.
   */
  function makeFixtureGamesRoot(games: Record<string, Record<string, string> | null>): string {
    const root = mkdtempSync(join(tmpdir(), 'm8-game-assets-'))
    for (const [game, assets] of Object.entries(games)) {
      const gameDir = join(root, game)
      mkdirSync(gameDir, { recursive: true })
      if (assets === null) continue
      const assetsDir = join(gameDir, 'assets')
      mkdirSync(assetsDir, { recursive: true })
      for (const [name, content] of Object.entries(assets)) {
        writeFileSync(join(assetsDir, name), content)
      }
    }
    return root
  }

  it('exits 0 against games within budget and reports each total', () => {
    const dir = makeFixtureGamesRoot({
      chess: { 'cover.svg': '<svg>chess</svg>' },
      draughts: { 'cover.svg': '<svg>draughts</svg>' },
    })
    try {
      const result = runGuard(dir, 1_000_000)
      expect(result.status).toBe(0)
      expect(result.stdout).toMatch(/chess: \d+ B\. Budget: 1000000 B\./)
      expect(result.stdout).toMatch(/draughts: \d+ B\. Budget: 1000000 B\./)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('exits non-zero when a game exceeds the budget, naming it and by how much', () => {
    const dir = makeFixtureGamesRoot({
      chess: { 'cover.svg': 'x'.repeat(2_000) },
      draughts: { 'cover.svg': 'x'.repeat(10) },
    })
    try {
      const result = runGuard(dir, 1_000)
      expect(result.status).not.toBe(0)
      expect(result.stderr).toMatch(/chess is 1000 B over budget/)
      // The game within budget must not also be blamed.
      expect(result.stderr).not.toMatch(/draughts is .* over budget/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('exits 0 when the same fixture is measured against a budget it fits', () => {
    // The mirror of the case above, against the same fixture: what decides
    // is the ceiling, not something incidental to the files.
    const dir = makeFixtureGamesRoot({ chess: { 'cover.svg': 'x'.repeat(2_000) } })
    try {
      const result = runGuard(dir, 1_000_000)
      expect(result.status).toBe(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('exits non-zero on a budget override that is not a positive whole number of bytes', () => {
    const dir = makeFixtureGamesRoot({ chess: { 'cover.svg': 'x' } })
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
    // command, and `npm run guard:assets` passes none.
    const dir = makeFixtureGamesRoot({ chess: { 'cover.svg': 'x'.repeat(50_000) } })
    try {
      const result = spawnSync(process.execPath, [scriptPath, dir], {
        cwd: repoRoot,
        encoding: 'utf8',
        env: { ...process.env, M8_GAME_ASSET_BUDGET_BYTES: '999999999' },
      })
      expect(result.status).not.toBe(0)
      expect(result.stderr).toMatch(/over budget/)
      expect(result.stdout).not.toContain('999999999')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('fails loudly, naming the game, when a game package has no assets directory at all', () => {
    // The failure this repository has already shipped once: a guard that
    // reports success over a directory with nothing measurable in it. An
    // absent `assets/` directory must be exactly as loud as an empty one.
    const dir = makeFixtureGamesRoot({
      chess: { 'cover.svg': 'x' },
      dominoes: null,
    })
    try {
      const result = runGuard(dir)
      expect(result.status).not.toBe(0)
      expect(result.stderr).toMatch(/dominoes/)
      expect(result.stderr).toMatch(/no measurable assets?/i)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('fails loudly, naming the game, when a game package has an empty assets directory', () => {
    const dir = makeFixtureGamesRoot({
      chess: { 'cover.svg': 'x' },
      dominoes: {},
    })
    try {
      const result = runGuard(dir)
      expect(result.status).not.toBe(0)
      expect(result.stderr).toMatch(/dominoes/)
      expect(result.stderr).toMatch(/no measurable assets?/i)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('exits non-zero when the games root directory does not exist', () => {
    const dir = mkdtempSync(join(tmpdir(), 'm8-game-assets-'))
    rmSync(dir, { recursive: true, force: true }) // now a guaranteed-unused, guaranteed-missing path
    const result = runGuard(dir)
    expect(result.status).not.toBe(0)
    expect(result.stderr).toMatch(/ENOENT/)
    expect(result.stderr).toContain(dir)
  })

  it('exits non-zero when the games root exists but has no game packages in it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'm8-game-assets-'))
    try {
      const result = runGuard(dir)
      expect(result.status).not.toBe(0)
      expect(result.stderr).toMatch(/No game packages found/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('measures the real catalogue and passes under the declared budget', () => {
    // No overrides: the same invocation `npm run guard:assets` makes, against
    // the real packages/games tree and the real budget.json ceiling.
    const result = runGuard()
    expect(result.status).toBe(0)
    expect(result.stdout).toMatch(/chess: \d+ B\./)
    expect(result.stdout).toMatch(/tic-tac-toe: \d+ B\./)
  })
})
