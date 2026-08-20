import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { gzipSizeSync } from 'gzip-size'
import { bytesOverBudget, isOverBudget } from './tv-size-budget.ts'

const TV_DIST = 'apps/tv/dist'

function assetFiles(dir) {
  const found = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...assetFiles(path))
    else if (entry.name.endsWith('.js') || entry.name.endsWith('.css')) found.push(path)
  }
  return found
}

/**
 * Which of "JavaScript" and "CSS" are entirely absent from `files`. A build
 * that emits CSS but no JavaScript (or the reverse) is not a passing build —
 * `assetFiles` matching `.js` *or* `.css` must not let that report a
 * plausible, comfortably-under-budget total while the bundle that actually
 * matters was never produced.
 */
function missingAssetKinds(files) {
  const missing = []
  if (!files.some((file) => file.endsWith('.js'))) missing.push('JavaScript')
  if (!files.some((file) => file.endsWith('.css'))) missing.push('CSS')
  return missing
}

// `tvDist` is overridable via a CLI argument (`process.argv[2]`) so tests can
// point the guard at a disposable fixture directory instead of the real
// `apps/tv/dist`. `npm run guard:size` passes no argument, so the default
// still governs normal use.
/**
 * The ceiling, normally from `budget.json`. Overridable *only* by the second
 * CLI argument, so a test can prove the guard actually *fails* a bundle that
 * exceeds it: nothing else in the suite pins the rejection path, and a size
 * guard that never rejects is indistinguishable from no guard at all.
 *
 * Deliberately not readable from the environment. A CLI argument is written
 * at the call site and visible in the command that ran; an environment
 * variable is invisible there, and one that raises a ceiling turns the whole
 * guard into something any job can quietly opt out of. `npm run guard:size`
 * passes no argument, so the budget file governs every real run.
 */
function budgetBytes(override) {
  if (override === undefined) {
    return JSON.parse(readFileSync('budget.json', 'utf8')).tvBundleGzipBytes
  }
  const parsed = Number(override)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Budget override must be a positive integer of bytes, got ${override}`)
  }
  return parsed
}

function main(tvDist, budgetOverride) {
  const files = assetFiles(tvDist)
  const missing = missingAssetKinds(files)
  if (missing.length > 0) {
    throw new Error(`No ${missing.join(' and no ')} found in ${tvDist}. Run the build first.`)
  }

  const limit = budgetBytes(budgetOverride)

  let total = 0
  for (const file of files) {
    const size = gzipSizeSync(readFileSync(file))
    total += size
    console.log(`${file}: ${size} B gzipped`)
  }

  console.log(`Total: ${total} B gzipped. Budget: ${limit} B.`)

  if (isOverBudget(total, limit)) {
    throw new Error(`Large-screen bundle is ${bytesOverBudget(total, limit)} B over budget.`)
  }
}

// `process.argv[1]` is not guaranteed to be an absolute path (it can be
// relative, e.g. under npm on Windows), so compare via `pathToFileURL`
// rather than string-concatenating a `file://` prefix onto it — the naive
// comparison silently never matches there, and `main()` never runs.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv[2] ?? TV_DIST, process.argv[3])
}
