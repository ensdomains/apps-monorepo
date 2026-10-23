import { describe, expect, it } from 'vitest'
import { hasInsufficientBalance, parseBalance } from './payment'

describe('payment utils', () => {
  describe('parseBalance', () => {
    it('should return 0 for undefined', () => {
      expect(parseBalance(undefined)).toBe(0)
    })

    it('should return 0 for empty string', () => {
      expect(parseBalance('')).toBe(0)
    })

    it('should parse plain number string', () => {
      expect(parseBalance('1234')).toBe(1234)
    })

    it('should parse number with commas', () => {
      expect(parseBalance('1,234.56')).toBe(1234.56)
    })

    it('should parse number with dollar sign', () => {
      expect(parseBalance('$1,234.56')).toBe(1234.56)
    })

    it('should remove USDC token', () => {
      expect(parseBalance('1,234.56 USDC')).toBe(1234.56)
    })

    it('should remove DAI token', () => {
      expect(parseBalance('1,234.56 DAI')).toBe(1234.56)
    })

    it('should remove USDT token', () => {
      expect(parseBalance('1,234.56 USDT')).toBe(1234.56)
    })

    it('should remove ETH token', () => {
      expect(parseBalance('1,234.56 ETH')).toBe(1234.56)
    })

    it('should handle case-insensitive tokens', () => {
      expect(parseBalance('1,234.56 usdc')).toBe(1234.56)
      expect(parseBalance('1,234.56 Eth')).toBe(1234.56)
    })

    it('should handle multiple spaces', () => {
      expect(parseBalance('  1,234.56   USDC  ')).toBe(1234.56)
    })

    it('should handle decimal numbers', () => {
      expect(parseBalance('0.123456')).toBe(0.123456)
    })

    it('should return 0 for invalid numbers', () => {
      expect(parseBalance('abc')).toBe(0)
      expect(parseBalance('not a number')).toBe(0)
    })

    it('should handle negative numbers', () => {
      expect(parseBalance('-1,234.56')).toBe(-1234.56)
    })

    it('should handle zero', () => {
      expect(parseBalance('0')).toBe(0)
      expect(parseBalance('0.00')).toBe(0)
    })
  })

  describe('hasInsufficientBalance', () => {
    it('should return false when price is 0', () => {
      expect(hasInsufficientBalance(100, 0)).toBe(false)
    })

    it('should return false when price is negative', () => {
      expect(hasInsufficientBalance(100, -10)).toBe(false)
    })

    it('should return true when balance is less than price', () => {
      expect(hasInsufficientBalance(50, 100)).toBe(true)
    })

    it('should return false when balance is greater than price', () => {
      expect(hasInsufficientBalance(150, 100)).toBe(false)
    })

    it('should return false when balance equals price', () => {
      expect(hasInsufficientBalance(100, 100)).toBe(false)
    })

    it('should handle string balance', () => {
      expect(hasInsufficientBalance('$50.00 USDC', 100)).toBe(true)
      expect(hasInsufficientBalance('$150.00 USDC', 100)).toBe(false)
    })

    it('should handle undefined balance as 0', () => {
      expect(hasInsufficientBalance(undefined, 100)).toBe(true)
    })

    it('should parse balance string correctly', () => {
      expect(hasInsufficientBalance('1,234.56 USDC', 1000)).toBe(false)
      expect(hasInsufficientBalance('1,234.56 USDC', 2000)).toBe(true)
    })

    it('should handle edge cases', () => {
      expect(hasInsufficientBalance(0, 100)).toBe(true)
      expect(hasInsufficientBalance(0.01, 100)).toBe(true)
      expect(hasInsufficientBalance(99.99, 100)).toBe(true)
    })
  })
})
