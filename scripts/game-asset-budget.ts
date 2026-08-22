/**
 * Pure over-budget arithmetic for the per-game asset budget guard.
 *
 * This mirrors `tv-size-budget.ts` on purpose rather than importing it: the
 * large screen's own bundle budget and a game's asset budget are two
 * independent ceilings, and a game's artwork must never be able to push the
 * platform's own budget around. Sharing the arithmetic would not by itself
 * couple the two ceilings together, but keeping the modules separate keeps
 * that guarantee visible in the file layout, not just in the numbers.
 */

/** How many bytes `total` exceeds `limit` by. Zero or negative means within budget. */
export function bytesOverBudget(total: number, limit: number): number {
  return total - limit
}

/** True once `total` exceeds `limit`. Exactly equal to the limit is still within budget. */
export function isOverBudget(total: number, limit: number): boolean {
  return bytesOverBudget(total, limit) > 0
}
