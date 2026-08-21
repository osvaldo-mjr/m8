import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseJsonc } from './jsonc.js'
import { expandWorkspacePatterns, lockfileWorkspacePaths } from './workspaces.js'

/**
 * The image copies one `package.json` per workspace before `npm ci`, so that
 * editing source never invalidates the dependency layer. That only holds
 * while *every* workspace is listed: a workspace whose manifest is missing
 * still installs — npm leaves a link that resolves once the source is copied
 * in a later stage — so the image goes on building, and the only symptom is
 * that changing that workspace's dependencies silently stops invalidating
 * the layer. `packages/avatars` was added late and missed exactly this way.
 *
 * The list comes from the `workspaces` patterns in `package.json`, not from a
 * hardcoded pair of directories: `packages/games/*` is declared and empty
 * today, and the first game would otherwise land there unnoticed by this
 * guard — reopening the gap the guard exists to close.
 */
const repoRoot = fileURLToPath(new URL('..', import.meta.url))

function childrenOf(directory: string): string[] {
  const absolute = join(repoRoot, directory)
  if (!existsSync(absolute)) return []
  return readdirSync(absolute, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
}

function declaredWorkspaces(): string[] {
  const manifest = parseJsonc(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as {
    workspaces?: string[]
  }
  return expandWorkspacePatterns(manifest.workspaces ?? [], childrenOf).filter((workspace) =>
    existsSync(join(repoRoot, workspace, 'package.json')),
  )
}

describe('the Dockerfile dependency layer', () => {
  const dockerfile = readFileSync(join(repoRoot, 'Dockerfile'), 'utf8')

  it('agrees with the workspace list npm itself recorded', () => {
    // Guards the guard, against a second source maintained by a different
    // tool. A count threshold would not do it: a scan that lost exactly one
    // workspace still clears a threshold, and losing one is the whole failure
    // mode here. This compares the derived list against every workspace npm
    // wrote into the lockfile, so one going missing on either side fails.
    const lock = JSON.parse(readFileSync(join(repoRoot, 'package-lock.json'), 'utf8'))
    expect(declaredWorkspaces()).toEqual(lockfileWorkspacePaths(lock))
  })

  it.each(declaredWorkspaces())('copies the manifest of %s before npm ci', (workspace) => {
    expect(dockerfile).toContain(`COPY ${workspace}/package.json ./${workspace}/package.json`)
  })
})
