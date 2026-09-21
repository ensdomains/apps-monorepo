import { describe, expect, it } from 'vitest'
import { formatGasEth } from './formatGasEth'

describe('formatGasEth', () => {
  it('trims an 18-decimal gas figure to something readable', () => {
    expect(formatGasEth(4_123_456_789_012_345n)).toBe('0.004123')
  })

  it('renders an empty wallet as zero, not a long decimal', () => {
    expect(formatGasEth(0n)).toBe('0')
  })

  it('keeps whole-ETH amounts intact', () => {
    expect(formatGasEth(1_000_000_000_000_000_000n)).toBe('1')
  })
})
