import { describe, expect, it } from 'vitest'
import { parseJsonc, stripJsonComments } from './jsonc.js'

describe('stripJsonComments', () => {
  it('removes a line comment', () => {
    expect(stripJsonComments('{ // why\n"a": 1 }')).toBe('{ \n"a": 1 }')
  })

  it('removes a block comment', () => {
    expect(stripJsonComments('{ /* why */ "a": 1 }')).toBe('{  "a": 1 }')
  })

  it('removes a block comment spanning lines', () => {
    expect(stripJsonComments('{\n/* one\n   two */\n"a": 1\n}')).toBe('{\n\n"a": 1\n}')
  })

  it('leaves a double slash inside a string alone', () => {
    // The failure this guards against: a path or URL in a value looking
    // exactly like the start of a comment and taking the rest of the line
    // with it.
    expect(stripJsonComments('{ "a": "https://example.test/x" }')).toBe(
      '{ "a": "https://example.test/x" }',
    )
  })

  it('leaves a block-comment opener inside a string alone', () => {
    expect(stripJsonComments('{ "a": "/* not a comment" }')).toBe('{ "a": "/* not a comment" }')
  })

  it('does not mistake an escaped quote for the end of a string', () => {
    expect(stripJsonComments('{ "a": "say \\" // here" }')).toBe('{ "a": "say \\" // here" }')
  })

  it('leaves comment-free input untouched', () => {
    expect(stripJsonComments('{"a":1}')).toBe('{"a":1}')
  })
})

describe('parseJsonc', () => {
  it('parses a commented object', () => {
    expect(parseJsonc('{\n  // the answer\n  "a": 42\n}')).toEqual({ a: 42 })
  })

  it('parses the repository\'s own root tsconfig, comments and all', () => {
    // Guards the guard: the point of this module is the real files, and a
    // stripper that works only on the fixtures above would be no use.
    expect(parseJsonc('{ "extends": "./x.json", // note\n "include": ["a"] }')).toEqual({
      extends: './x.json',
      include: ['a'],
    })
  })
})
