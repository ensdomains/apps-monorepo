import { describe, expect, it } from 'vitest'
import { isL1ReverseRegistrarChainId } from './reverseRegistrarChainId'

describe('isL1ReverseRegistrarChainId', () => {
  it('should return true for chain ID 1 (Ethereum Mainnet)', () => {
    const result = isL1ReverseRegistrarChainId(1)

    expect(result).toBe(true)
  })

  it('should return true for chain ID 60 (Ethereum as coin type)', () => {
    const result = isL1ReverseRegistrarChainId(60)

    expect(result).toBe(true)
  })

  it('should return false for L2 chain IDs', () => {
    expect(isL1ReverseRegistrarChainId(10)).toBe(false) // Optimism
    expect(isL1ReverseRegistrarChainId(42161)).toBe(false) // Arbitrum
    expect(isL1ReverseRegistrarChainId(8453)).toBe(false) // Base
    expect(isL1ReverseRegistrarChainId(59144)).toBe(false) // Linea
    expect(isL1ReverseRegistrarChainId(534352)).toBe(false) // Scroll
  })

  it('should return false for unknown chain IDs', () => {
    expect(isL1ReverseRegistrarChainId(999)).toBe(false)
    expect(isL1ReverseRegistrarChainId(5)).toBe(false) // Goerli
    expect(isL1ReverseRegistrarChainId(11155111)).toBe(false) // Sepolia
  })

  it('should return false for zero', () => {
    expect(isL1ReverseRegistrarChainId(0)).toBe(false)
  })

  it('should return false for negative numbers', () => {
    expect(isL1ReverseRegistrarChainId(-1)).toBe(false)
    expect(isL1ReverseRegistrarChainId(-60)).toBe(false)
  })
})
