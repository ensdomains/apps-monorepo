import { describe, expect, it } from 'vitest'
import { isNormalized, isValidEnsName } from './isNormalized'

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

describe('isValidEnsName', () => {
  it('should return true for 1LDs (TLDs)', () => {
    expect(isValidEnsName('eth')).toBe(true)
    expect(isValidEnsName('com')).toBe(true)
    expect(isValidEnsName('xyz')).toBe(true)
  })

  it('should return true for 2LDs (.eth names)', () => {
    expect(isValidEnsName('vitalik.eth')).toBe(true)
    expect(isValidEnsName('example.eth')).toBe(true)
    expect(isValidEnsName('test-123.eth')).toBe(true)
  })

  it('should return true for 3LDs and deeper', () => {
    expect(isValidEnsName('sub.vitalik.eth')).toBe(true)
    expect(isValidEnsName('deep.sub.vitalik.eth')).toBe(true)
  })

  it('should return false for empty string', () => {
    expect(isValidEnsName('')).toBe(false)
  })

  it('should return false for invalid characters', () => {
    expect(isValidEnsName('test!@#.eth')).toBe(false)
    expect(isValidEnsName('invalid name.eth')).toBe(false) // space
  })

  it('should return false for non-normalized names', () => {
    expect(isValidEnsName('Vitalik.eth')).toBe(false) // uppercase
    expect(isValidEnsName('ETH')).toBe(false) // uppercase 1LD
  })
})
