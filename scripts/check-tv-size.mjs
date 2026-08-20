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

function main() {
  const files = assetFiles(TV_DIST)
  if (files.length === 0) {
    throw new Error(`No JS or CSS found in ${TV_DIST}. Run the build first.`)
  }

  const budget = JSON.parse(readFileSync('budget.json', 'utf8'))
  const limit = budget.tvBundleGzipBytes

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
  main()
}
