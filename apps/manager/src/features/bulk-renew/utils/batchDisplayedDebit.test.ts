import { describe, expect, it } from 'vitest'
import { getBatchDisplayedDebit } from './batchDisplayedDebit'

describe('getBatchDisplayedDebit', () => {
  const shown = { usdc: 30_000_000n, token: 0n }

  it.each([
    ['the whole debit to the first batch', 0n, 30_000_000n],
    ['what is left after earlier batches', 18_000_000n, 12_000_000n],
    ['nothing once the debit is used up', 31_000_000n, 0n],
  ] as const)('gives %s', (_case, movedUsdc, usdc) => {
    expect(getBatchDisplayedDebit(shown, movedUsdc)).toEqual({
      usdc,
      token: 0n,
    })
  })
})
