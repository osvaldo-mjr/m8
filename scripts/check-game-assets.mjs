import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { bytesOverBudget, isOverBudget } from './game-asset-budget.ts'

const GAMES_ROOT = 'packages/games'

/**
 * Raw bytes, not gzipped transfer bytes like `check-tv-size.mjs` uses for the
 * large-screen's JavaScript and CSS.
 *
 * That guard measures transfer cost because the shell is text that compresses
 * well and is served compressed. A game's cover art is under no such
 * guarantee: today every cover happens to be an SVG, but a game package is
 * free to ship a PNG or JPEG instead, and nothing in this repository puts a
 * compression layer in front of `/covers/<id>/*` (`@fastify/static` alone,
 * registered per game in `apps/server/src/app.ts` — no `@fastify/compress`).
 * Measuring transfer bytes here would silently favour whichever format
 * happens to gzip well, which is exactly the kind of measurement that
 * quietly stops reflecting reality — the same trap the TV guard's own
 * comments warn about elsewhere in this repository. Raw bytes are what
 * actually crosses the wire for every format alike, so raw bytes are what
 * this guard counts, mirroring the TV guard's own choice to measure fonts
 * (which do not compress further either) raw rather than gzipped.
 */
function assetBytes(path) {
  return readFileSync(path).byteLength
}

function assetFiles(dir) {
  const found = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...assetFiles(path))
    else found.push(path)
  }
  return found
}

/** The names of every game package under `gamesRoot`, in a stable order. */
function gamePackages(gamesRoot) {
  return readdirSync(gamesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}

/** The key `budget.json` declares this ceiling under. */
const BUDGET_KEY = 'gameAssetBytes'

/**
 * The ceiling, normally from `budget.json`.
 *
 * Independent of `tvBundleTransferBytes`: this guard reads its own key and
 * nothing else in `budget.json`, so a game's asset budget can move without
 * touching the large screen's, and vice versa. The key is checked rather
 * than trusted, because a rename that missed this file would read
 * `undefined`, compare `NaN` against the total, find it not greater, and
 * pass every game for ever — a budget guard that silently stops guarding is
 * worse than none.
 *
 * Overridable *only* by the second CLI argument, so a test can prove the
 * guard actually *fails* a game that exceeds the ceiling. Deliberately not
 * readable from the environment, for the same reason `check-tv-size.mjs`
 * refuses one: an environment variable is invisible at the call site and
 * would let any job quietly opt out of the budget. `npm run guard:assets`
 * passes no argument, so the budget file governs every real run.
 */
function budgetBytes(override) {
  if (override === undefined) {
    const declared = JSON.parse(readFileSync('budget.json', 'utf8'))[BUDGET_KEY]
    if (!Number.isInteger(declared) || declared <= 0) {
      throw new Error(
        `budget.json must declare ${BUDGET_KEY} as a positive whole number of bytes, got ${declared}`,
      )
    }
    return declared
  }
  const parsed = Number(override)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Budget override must be a positive integer of bytes, got ${override}`)
  }
  return parsed
}

// `gamesRoot` is overridable via a CLI argument (`process.argv[2]`) so tests
// can point the guard at a disposable fixture directory instead of the real
// `packages/games`. `npm run guard:assets` passes no argument, so the default
// still governs normal use.
function main(gamesRoot, budgetOverride) {
  const limit = budgetBytes(budgetOverride)
  const games = gamePackages(gamesRoot)
  if (games.length === 0) {
    throw new Error(`No game packages found in ${gamesRoot}.`)
  }

  // Every game is checked, not just the first that fails: a run should name
  // every game missing assets and every game over budget in one message,
  // rather than stopping at whichever problem happened to sort first.
  const problems = []

  for (const game of games) {
    const assetsDir = join(gamesRoot, game, 'assets')
    let files
    try {
      files = assetFiles(assetsDir)
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        files = []
      } else {
        throw error
      }
    }

    // A game package with no measurable asset is exactly the failure this
    // repository has already shipped once, in a different guard: reporting
    // success over a directory with nothing in it. An absent `assets/`
    // directory and an empty one are the same failure and must be exactly as
    // loud.
    if (files.length === 0) {
      problems.push(`${game} has no measurable assets in ${assetsDir}.`)
      continue
    }

    let total = 0
    for (const file of files) {
      const bytes = assetBytes(file)
      total += bytes
      console.log(`${file}: ${bytes} B`)
    }
    console.log(`${game}: ${total} B. Budget: ${limit} B.`)

    if (isOverBudget(total, limit)) {
      problems.push(`${game} is ${bytesOverBudget(total, limit)} B over budget.`)
    }
  }

  if (problems.length > 0) {
    throw new Error(problems.join(' '))
  }
}

// `process.argv[1]` is not guaranteed to be an absolute path (it can be
// relative, e.g. under npm on Windows), so compare via `pathToFileURL`
// rather than string-concatenating a `file://` prefix onto it — the naive
// comparison silently never matches there, and `main()` never runs. This is
// the exact bug two earlier guards in this repository shipped with.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv[2] ?? GAMES_ROOT, process.argv[3])
}
