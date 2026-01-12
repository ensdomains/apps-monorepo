import { describe, expect, it } from 'vitest'
import { isNormalized } from './isNormalized'

describe('isNormalized', () => {
  it('should return true for normalized ENS names', () => {
    expect(isNormalized('vitalik.eth')).toBe(true)
    expect(isNormalized('sub.vitalik.eth')).toBe(true)
    expect(isNormalized('test-123.eth')).toBe(true)
    expect(isNormalized('')).toBe(true)
  })

  it('should return false for non-normalized names', () => {
    expect(isNormalized('Vitalik.eth')).toBe(false) // uppercase
    expect(isNormalized('ViTaLiK.eth')).toBe(false) // mixed case
    expect(isNormalized('test!@#.eth')).toBe(false) // invalid characters
    expect(isNormalized(' vitalik.eth')).toBe(false) // leading space
  })
})
