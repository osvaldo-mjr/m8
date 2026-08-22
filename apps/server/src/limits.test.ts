import { MAX_SEATS } from '@m8/contract'
import { MAX_PARTICIPANTS, NICKNAME_MAX_LENGTH as DOMAIN_LIMIT } from '@m8/core'
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
