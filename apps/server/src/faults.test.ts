import { describe, expect, it } from 'vitest'
import { messageTypeOf, toError } from './faults.js'

describe('toError', () => {
  it('keeps the error it was given, stack and all', () => {
    const original = new Error('translation blew up')
    expect(toError(original)).toBe(original)
  })

  it('wraps a thrown non-error so the report still carries a stack', () => {
    // `throw` accepts any value. A fault line whose whole content is the word
    // "undefined" tells whoever reads the log nothing about where it came
    // from, so anything that is not already an Error is wrapped in one — which
    // captures a stack at the catch site, the frame that matters here.
    const wrapped = toError('just a string')

    expect(wrapped).toBeInstanceOf(Error)
    expect(wrapped.message).toBe('just a string')
    expect(wrapped.stack).toBeTruthy()
  })

  it('names a thrown undefined rather than losing it', () => {
    expect(toError(undefined).message).toBe('undefined')
  })
})

describe('messageTypeOf', () => {
  it('reads the type a raw message claims', () => {
    expect(messageTypeOf({ type: 'previewGame', gameId: 'chess' })).toBe('previewGame')
  })

  it('reads it from the unvalidated value, since a fault is written when validation did not finish', () => {
    expect(messageTypeOf({ type: 'launchMissiles' })).toBe('launchMissiles')
  })

  it.each([[null], [undefined], ['a string'], [42], [{ type: 7 }], [{}]])(
    'has no type to report for %s',
    (raw) => {
      expect(messageTypeOf(raw)).toBeUndefined()
    },
  )
})
