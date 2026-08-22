/**
 * Pure checks over what the README claims about the repository.
 *
 * The README is the one file a reader opens first, and it is where this
 * repository's characteristic defect keeps landing: a figure that was true
 * when it was written and is quietly false a plan later. One commit on main
 * was "Correct the two figures the README states"; the next branch invalidated
 * both again without touching the file, and dropped the branch's central
 * structural addition from the layout table on top of that.
 *
 * The answer is not another proofread. A claim about the repository's own
 * shape can be checked against the repository, so the ones that can be are —
 * and the ones that cannot (how many tests there are, how many bytes the
 * bundle came out at this week) were removed from the prose rather than left
 * to rot, because nothing can hold them true.
 *
 * Kept free of disk access so each check can be exercised with plain values,
 * the same shape as `scripts/workspaces.ts` and `scripts/node-version.ts`.
 */

/**
 * The workspaces the README's layout table does not account for.
 *
 * A workspace counts as accounted for if the table names its path, or names a
 * declared pattern that covers it — `packages/games/*` stands for every game
 * without the table growing a row per game, which is the point of that
 * directory.
 */
export function uncoveredWorkspaces(
  readme: string,
  workspaces: readonly string[],
  patterns: readonly string[],
): string[] {
  const covering = patterns.filter((pattern) => pattern.endsWith('/*') && readme.includes(pattern))
  return workspaces.filter((workspace) => {
    if (readme.includes(workspace)) return false
    return !covering.some((pattern) => workspace.startsWith(pattern.slice(0, -1)))
  })
}

/**
 * Whether the prose quotes a number, in either of the two ways a person writes
 * one: `42000` as the machine holds it, and `42,000` as a sentence reads it.
 *
 * Bounded on both sides so `4200` does not satisfy a claim about `42000`, and
 * so `142,000` does not either.
 */
export function statesNumber(text: string, value: number): boolean {
  const plain = String(value)
  const grouped = value.toLocaleString('en-US')
  // Interpolated into a pattern without escaping, which is safe here and only
  // here: both forms come from a `number`, so they are digits and commas and
  // nothing a regular expression reads as syntax.
  return [plain, grouped].some((form) => new RegExp(`(?<![\\d,])${form}(?![\\d,])`).test(text))
}
