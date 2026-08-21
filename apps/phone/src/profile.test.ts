import { describe, expect, it } from 'vitest'
import { avatarTileClassName, describeProfileSubmission } from './profile.js'

describe('describeProfileSubmission', () => {
  it('cannot submit an empty nickname, and says why', () => {
    const submission = describeProfileSubmission('')
    expect(submission.canSubmit).toBe(false)
    expect(submission.reason).not.toBeNull()
  })

  it('cannot submit a whitespace-only nickname, and says why', () => {
    const submission = describeProfileSubmission('   ')
    expect(submission.canSubmit).toBe(false)
    expect(submission.reason).not.toBeNull()
  })

  it('can submit a real nickname, with no reason attached', () => {
    expect(describeProfileSubmission('Ana')).toEqual({ canSubmit: true, reason: null })
  })

  it('can submit a nickname with surrounding whitespace, since it trims to something real', () => {
    expect(describeProfileSubmission('  Ana  ')).toEqual({ canSubmit: true, reason: null })
  })
})

describe('avatarTileClassName', () => {
  // `apps/phone` has no DOM testing library, so this cannot assert a
  // rendered border colour. What it can assert is the shape of the
  // regression that already happened once: the chosen tile's fill colour
  // (`m8-person-bg`) is not, by itself, a state cue that survives a palette
  // change, because that is exactly what shipped and was caught only by the
  // owner looking at a phone. The paper border restored is unrelated to
  // fill colour, so it is the cue this guards.
  it('marks the chosen tile with a border the fill colour does not provide', () => {
    expect(avatarTileClassName(true)).toContain('border-paper')
    expect(avatarTileClassName(true)).not.toContain('border-transparent')
  })

  it('leaves an unchosen tile without that border', () => {
    expect(avatarTileClassName(false)).not.toContain('border-paper')
    expect(avatarTileClassName(false)).toContain('border-transparent')
  })

  it('differs between chosen and unchosen by more than the fill colour class', () => {
    // If the two collapsed back to differing only in `m8-person-bg`, the
    // cue would again depend entirely on the palette in force. Stripping
    // that one class from each must still leave them different.
    const strip = (className: string) => className.replace('m8-person-bg', '').trim()
    expect(strip(avatarTileClassName(true))).not.toBe(strip(avatarTileClassName(false)))
  })
})
