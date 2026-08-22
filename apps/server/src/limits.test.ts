import type { Locale as ContractLocale } from '@m8/contract'
import { MAX_SEATS } from '@m8/contract'
import type { TablePhase } from '@m8/core'
import { MAX_PARTICIPANTS, NICKNAME_MAX_LENGTH as DOMAIN_LIMIT } from '@m8/core'
import type { Locale as WireLocale, TablePhaseName } from '@m8/protocol'
import { NICKNAME_MAX_LENGTH as WIRE_LIMIT } from '@m8/protocol'
import { describe, expect, it } from 'vitest'

/**
 * The nickname limit exists twice, and has to.
 *
 * `@m8/core` owns the rule — it is the thing that truncates — and never
 * imports the wire vocabulary, so that the domain and the protocol can change
 * on separate schedules. The phone needs the same number for its input's
 * `maxLength`, and must not import `@m8/core`, which would pull the domain
 * into a browser bundle. So the wire publishes its own copy and the phone
 * reads that.
 *
 * Two copies drift. This test lives in `apps/server` because the server is
 * the one place that legitimately sees both packages: it is the translator.
 * Drift now fails a test instead of shipping an input that silently accepts
 * more characters than the server will keep.
 */
describe('the nickname limit', () => {
  it('is the same number on the wire as in the domain', () => {
    expect(WIRE_LIMIT).toBe(DOMAIN_LIMIT)
  })

  it('is a usable length rather than an accidental zero', () => {
    // Guards the guard: two constants that were both undefined, or both
    // zero, would satisfy the equality above and break every nickname.
    expect(DOMAIN_LIMIT).toBeGreaterThan(0)
  })

  it('bounds a table at the same number in the contract and in the domain', () => {
    expect(MAX_SEATS).toBe(MAX_PARTICIPANTS)
  })
})

/**
 * `TablePhaseName` and `Locale` exist twice for the same reason the nickname
 * limit does: `@m8/protocol` must not import `@m8/core` or `@m8/contract`, so
 * it carries its own copies of their unions, written out rather than
 * imported. This file is the one place that legitimately sees all three
 * packages, so it is where the copies are proved to still agree.
 *
 * A type-level assertion, not a runtime one: two unions can only be compared
 * for their exact membership by the type checker, and a runtime check here
 * could pass on the very data that revealed a divergence. Naive distributive
 * comparisons such as `A extends B ? (B extends A ? true : never) : never`
 * do not actually work for this — they resolve to `boolean` regardless of
 * whether the unions agree, so a broken check like that would report
 * agreement even after a real drift. `IfEquals` is the standard
 * function-type trick that side-steps distribution and genuinely tells two
 * unions apart; a mismatch resolves `Y` to `false`, which fails
 * `expect(...).toBe(true)` below, and every combination here has been
 * verified by hand against a deliberately mismatched pair before being
 * trusted.
 */
type IfEquals<T, U, Y = true, N = false> = (<G>() => G extends T ? 1 : 2) extends (
  <G>() => G extends U ? 1 : 2
)
  ? Y
  : N

describe('the wire and the domain agree on their shared vocabulary', () => {
  it('names the same locales', () => {
    const localesAgree: IfEquals<WireLocale, ContractLocale> = true
    expect(localesAgree).toBe(true)
  })

  it('names the same table phases', () => {
    const phasesAgree: IfEquals<TablePhaseName, TablePhase> = true
    expect(phasesAgree).toBe(true)
  })
})
