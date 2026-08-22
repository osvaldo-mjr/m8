import { describe, expect, it } from 'vitest'
import { canStart, createSeats, firstFreeSeat, occupiedCount, seatOf } from './seats.js'

describe('createSeats', () => {
  it('creates the game maximum, numbered from one, all empty', () => {
    const seats = createSeats(4)
    expect(seats.map((seat) => seat.number)).toEqual([1, 2, 3, 4])
    expect(seats.every((seat) => seat.occupantId === null)).toBe(true)
  })
})

describe('firstFreeSeat', () => {
  it('is the lowest-numbered empty seat', () => {
    const seats = [
      { number: 1, occupantId: 'p-1' },
      { number: 2, occupantId: null },
      { number: 3, occupantId: null },
    ]
    expect(firstFreeSeat(seats)?.number).toBe(2)
  })

  it('is undefined when every seat is taken', () => {
    expect(firstFreeSeat([{ number: 1, occupantId: 'p-1' }])).toBeUndefined()
  })
})

describe('seatOf', () => {
  it('finds the seat a participant occupies', () => {
    const seats = [
      { number: 1, occupantId: 'p-1' },
      { number: 2, occupantId: 'p-2' },
    ]
    expect(seatOf(seats, 'p-2')?.number).toBe(2)
  })

  it('is undefined for someone not seated', () => {
    expect(seatOf([{ number: 1, occupantId: null }], 'p-1')).toBeUndefined()
  })
})

describe('canStart', () => {
  it('is false below the minimum', () => {
    expect(canStart([{ number: 1, occupantId: 'p-1' }, { number: 2, occupantId: null }], 2)).toBe(false)
  })

  it('is true at the minimum, even with a seat still empty', () => {
    const seats = [
      { number: 1, occupantId: 'p-1' },
      { number: 2, occupantId: 'p-2' },
      { number: 3, occupantId: null },
    ]
    expect(canStart(seats, 2)).toBe(true)
  })
})

describe('occupiedCount', () => {
  it('counts only taken seats', () => {
    expect(occupiedCount([
      { number: 1, occupantId: 'p-1' },
      { number: 2, occupantId: null },
    ])).toBe(1)
  })
})
