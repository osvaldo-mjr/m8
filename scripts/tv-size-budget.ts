/**
 * Pure over-budget arithmetic for the large-screen size guard. Kept separate
 * from disk access and gzip measurement so the decision itself — and its
 * boundary — can be exercised with plain numbers.
 */

/** How many bytes `total` exceeds `limit` by. Zero or negative means within budget. */
export function bytesOverBudget(total: number, limit: number): number {
  return total - limit
}

/** True once `total` exceeds `limit`. Exactly equal to the limit is still within budget. */
export function isOverBudget(total: number, limit: number): boolean {
  return bytesOverBudget(total, limit) > 0
}
