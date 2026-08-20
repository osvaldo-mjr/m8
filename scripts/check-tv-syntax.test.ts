import { describe, expect, it } from 'vitest'
import { assertEs2017 } from './check-tv-syntax.mjs'

describe('assertEs2017', () => {
  it('accepts ES2017 syntax', () => {
    expect(() => assertEs2017('async function f() { await 1 }', 'ok.js')).not.toThrow()
  })

  it('accepts a ternary followed by a fractional literal, not optional chaining', () => {
    // Minified code can produce `a?.5:b` — a ternary whose consequent is `.5`.
    // A text search for `?.` would flag this; a real ES2017 grammar does not.
    expect(() => assertEs2017('const x = a?.5:b', 'ok.js')).not.toThrow()
  })

  it('rejects optional chaining', () => {
    expect(() => assertEs2017('const x = a?.b', 'bad.js')).toThrow(/bad\.js/)
  })

  it('rejects nullish coalescing', () => {
    expect(() => assertEs2017('const x = a ?? b', 'bad.js')).toThrow(/bad\.js/)
  })

  it('rejects class private fields', () => {
    expect(() => assertEs2017('class A { #x = 1 }', 'bad.js')).toThrow(/bad\.js/)
  })
})
