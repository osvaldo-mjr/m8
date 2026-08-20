import { describe, expect, it } from 'vitest'
import { describeProfileSubmission } from './profile.js'

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
