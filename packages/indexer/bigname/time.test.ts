import { describe, expect, it } from 'vitest'
import { secondsToTimestamp } from './time'

describe('secondsToTimestamp', () => {
  it('writes unix seconds as bigname accepts them, flooring fractions', () => {
    expect(secondsToTimestamp(new Date(1790999568900))).toBe('1790999568')
    expect(secondsToTimestamp(1790999568.7)).toBe('1790999568')
    expect(secondsToTimestamp(5n)).toBe('5')
  })
})
