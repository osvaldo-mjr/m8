import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { gzipSizeSync } from 'gzip-size'
import { bytesOverBudget, isOverBudget } from './tv-size-budget.ts'

const TV_DIST = 'apps/tv/dist'

/**
 * Code and stylesheets. These compress, and the server serves them
 * compressed, so what they cost the television is their gzipped size.
 */
const TEXT_EXTENSIONS = ['.js', '.css']

/**
 * Fonts, which this screen now self-hosts because the television may have no
 * route to the internet at all.
 *
 * They were invisible to this guard until they existed: it matched `.js` and
 * `.css` only, so two woff2 files could be added and the bundle would go on
 * being reported as comfortably within budget while the set downloaded
 * twenty kilobytes more. The budget exists to keep the television light, and
 * a guard that cannot see the heaviest new asset is not a budget.
 *
 * Measured raw, not gzipped: woff2 carries its own compression, nothing
 * gzips it a second time on the way out, and a gzipped figure here would
 * quietly understate what the television actually fetches.
 */
const FONT_EXTENSIONS = ['.woff2', '.woff', '.ttf', '.otf']

function hasExtension(name, extensions) {
  return extensions.some((extension) => name.endsWith(extension))
}

function assetFiles(dir) {
  const found = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...assetFiles(path))
    else if (hasExtension(entry.name, TEXT_EXTENSIONS) || hasExtension(entry.name, FONT_EXTENSIONS)) {
      found.push(path)
    }
  }
  return found
}

/** What one file costs the television to fetch, and how that was arrived at. */
function transferCost(path) {
  const bytes = readFileSync(path)
  if (hasExtension(path, FONT_EXTENSIONS)) {
    return { bytes: bytes.byteLength, how: 'raw' }
  }
  return { bytes: gzipSizeSync(bytes), how: 'gzipped' }
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

/** The key `budget.json` declares the ceiling under. */
const BUDGET_KEY = 'tvBundleTransferBytes'

/**
 * The ceiling, normally from `budget.json`.
 *
 * Renamed from `tvBundleGzipBytes` when the fonts arrived: the total is no
 * longer a gzipped figure, and a key that says it is would be the same
 * understatement this guard just stopped making.
 *
 * The key is checked rather than trusted, because a rename that missed one
 * of the two files would have read `undefined`, compared `NaN` against the
 * total, found it not greater, and passed every bundle for ever — a size
 * guard that silently stops guarding is worse than none.
 *
 * Overridable *only* by the second CLI argument, so a test can prove the
 * guard actually *fails* a bundle that exceeds the ceiling: nothing else in
 * the suite pins the rejection path, and a guard that never rejects is
 * indistinguishable from no guard at all.
 *
 * Deliberately not readable from the environment. A CLI argument is written
 * at the call site and visible in the command that ran; an environment
 * variable is invisible there, and one that raises a ceiling turns the whole
 * guard into something any job can quietly opt out of. `npm run guard:size`
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

// `tvDist` is overridable via a CLI argument (`process.argv[2]`) so tests can
// point the guard at a disposable fixture directory instead of the real
// `apps/tv/dist`. `npm run guard:size` passes no argument, so the default
// still governs normal use.
function main(tvDist, budgetOverride) {
  const files = assetFiles(tvDist)
  const missing = missingAssetKinds(files)
  if (missing.length > 0) {
    throw new Error(`No ${missing.join(' and no ')} found in ${tvDist}. Run the build first.`)
  }

  const limit = budgetBytes(budgetOverride)

  let total = 0
  for (const file of files) {
    const cost = transferCost(file)
    total += cost.bytes
    console.log(`${file}: ${cost.bytes} B ${cost.how}`)
  }

  console.log(`Total: ${total} B transferred. Budget: ${limit} B.`)

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
