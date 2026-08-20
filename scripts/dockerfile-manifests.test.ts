import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The image copies one `package.json` per workspace before `npm ci`, so that
 * editing source never invalidates the dependency layer. That only holds
 * while *every* workspace is listed: a workspace whose manifest is missing
 * still installs — npm leaves a link that resolves once the source is copied
 * in a later stage — so the image goes on building, and the only symptom is
 * that changing that workspace's dependencies silently stops invalidating
 * the layer. `packages/avatars` was added late and missed exactly this way.
 *
 * Reading the workspace list from disk rather than restating it is the whole
 * value: adding a workspace and forgetting the Dockerfile fails here.
 */
const repoRoot = fileURLToPath(new URL('..', import.meta.url))

function workspaceDirectories(): string[] {
  const roots = ['packages', 'apps']
  const found: string[] = []
  for (const root of roots) {
    const absolute = join(repoRoot, root)
    if (!existsSync(absolute)) continue
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      if (existsSync(join(absolute, entry.name, 'package.json'))) {
        found.push(`${root}/${entry.name}`)
      }
    }
  }
  return found
}

describe('the Dockerfile dependency layer', () => {
  const dockerfile = readFileSync(join(repoRoot, 'Dockerfile'), 'utf8')

  it('finds the workspaces it is meant to check', () => {
    // Guards the guard: a broken directory scan would make every assertion
    // below vacuously true.
    expect(workspaceDirectories().length).toBeGreaterThanOrEqual(7)
  })

  it.each(workspaceDirectories())('copies the manifest of %s before npm ci', (workspace) => {
    expect(dockerfile).toContain(`COPY ${workspace}/package.json ./${workspace}/package.json`)
  })
})
