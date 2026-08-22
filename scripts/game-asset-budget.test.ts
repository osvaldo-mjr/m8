import { describe, expect, it } from 'vitest'
import { bytesOverBudget, isOverBudget } from './game-asset-budget.js'

describe('bytesOverBudget', () => {
  it('is positive when the total exceeds the limit', () => {
    expect(bytesOverBudget(120, 100)).toBe(20)
  })

  it('is zero when the total exactly equals the limit', () => {
    expect(bytesOverBudget(100, 100)).toBe(0)
  })

  it('is negative when the total is under the limit', () => {
    expect(bytesOverBudget(80, 100)).toBe(-20)
  })
})

describe('isOverBudget', () => {
  it('is true once the total exceeds the limit', () => {
    expect(isOverBudget(101, 100)).toBe(true)
  })

  it('is false at the boundary where the total exactly equals the limit', () => {
    expect(isOverBudget(100, 100)).toBe(false)
  })

  it('is false when comfortably under the limit', () => {
    expect(isOverBudget(50, 100)).toBe(false)
  })
})
