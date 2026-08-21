/**
 * Pure derivation of the workspace list that several guards have to agree on.
 *
 * The Dockerfile copies one `package.json` per workspace before `npm ci`, and
 * a guard checks it does. That guard used to walk a hardcoded `['packages',
 * 'apps']`, while `package.json` declares `packages/games/*` as well — the
 * directory the design mandates for the first game. The first game workspace
 * would have reopened the gap the guard exists to close, with the guard
 * silent. So the list is derived from the declaration instead.
 *
 * Kept free of disk access so the expansion can be exercised with plain
 * values, the same shape as `scripts/node-version.ts`.
 */

/**
 * Expands the `workspaces` patterns from a manifest into directory paths.
 *
 * Handles the only two shapes npm workspaces are declared in here: a literal
 * path, and a parent with a `*` for its children. A pattern naming a parent
 * that does not exist yet contributes nothing rather than failing, because
 * `packages/games/*` is declared before any game exists.
 *
 * `childrenOf` reports the child directories of a path, or an empty list when
 * the path is not a directory.
 */
export function expandWorkspacePatterns(
  patterns: readonly string[],
  childrenOf: (directory: string) => readonly string[],
): string[] {
  const found = new Set<string>()
  for (const pattern of patterns) {
    if (pattern.endsWith('/*')) {
      const parent = pattern.slice(0, -2)
      for (const child of childrenOf(parent)) found.add(`${parent}/${child}`)
    } else {
      found.add(pattern)
    }
  }
  return [...found].sort()
}

/**
 * The workspace directories npm itself recorded in `package-lock.json`.
 *
 * An independent second source for the same list, maintained by a different
 * tool: the lock names every workspace as a top-level entry under `packages`.
 * Nested installs (`apps/phone/node_modules/tailwindcss`) appear there too and
 * are not workspaces, so anything under a `node_modules` is dropped.
 */
export function lockfileWorkspacePaths(lock: unknown): string[] {
  const packages = (lock as { packages?: Record<string, unknown> }).packages ?? {}
  return Object.keys(packages)
    .filter((path) => path !== '' && !path.split('/').includes('node_modules'))
    .sort()
}
