import { describe, expect, it } from 'vitest'
import { isNormalized } from './isNormalized'

describe('isNormalized', () => {
  it('should return true for normalized ENS names', () => {
    expect(isNormalized('vitalik.eth')).toBe(true)
    expect(isNormalized('nick.eth')).toBe(true)
    expect(isNormalized('test123.eth')).toBe(true)
  })

  it('should return true for normalized subdomains', () => {
    expect(isNormalized('sub.vitalik.eth')).toBe(true)
    expect(isNormalized('a.b.c.eth')).toBe(true)
  })

  it('should return false for uppercase characters', () => {
    expect(isNormalized('Vitalik.eth')).toBe(false)
    expect(isNormalized('NICK.eth')).toBe(false)
  })

  it('should return false for mixed case', () => {
    expect(isNormalized('ViTaLiK.eth')).toBe(false)
  })

  it('should return false for invalid characters', () => {
    // ENS normalize will throw for invalid characters
    expect(isNormalized('test!@#.eth')).toBe(false)
    expect(isNormalized('test..eth')).toBe(false) // double dot
  })

  it('should return true for empty string', () => {
    // ens_normalize returns empty string for empty input, so it's considered normalized
    expect(isNormalized('')).toBe(true)
  })

  it('should handle names with hyphens', () => {
    expect(isNormalized('test-name.eth')).toBe(true)
  })

  it('should handle names with numbers', () => {
    expect(isNormalized('123.eth')).toBe(true)
    expect(isNormalized('test123.eth')).toBe(true)
  })

  it('should return false for leading/trailing spaces', () => {
    expect(isNormalized(' vitalik.eth')).toBe(false)
    expect(isNormalized('vitalik.eth ')).toBe(false)
  })
})
