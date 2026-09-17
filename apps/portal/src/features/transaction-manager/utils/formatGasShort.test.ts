import { describe, expect, it } from 'vitest'
import { formatGasShort } from './formatGasShort'

describe('formatGasShort', () => {
  it('trims an 18-decimal gas figure to something readable', () => {
    expect(formatGasShort(4_123_456_789_012_345n)).toBe('0.00412')
  })

  it('renders an empty wallet as zero rather than a long decimal', () => {
    expect(formatGasShort(0n)).toBe('0')
  })

  it('keeps whole-ETH amounts intact', () => {
    expect(formatGasShort(1_000_000_000_000_000_000n)).toBe('1')
  })
})
