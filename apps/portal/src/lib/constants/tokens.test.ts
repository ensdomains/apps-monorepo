import type { TOKEN_SYMBOL } from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { TOKENS } from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { describe, expect, it } from 'vitest'
import {
  getSupportedTokenAddress,
  isSupportedTokenSymbol,
  SUPPORTED_TOKENS,
} from './tokens'

const ALL_SHARED_SYMBOLS = Object.keys(TOKENS) as TOKEN_SYMBOL[]

describe('portal token support', () => {
  it('resolves an address for every token portal offers', () => {
    for (const symbol of Object.keys(
      SUPPORTED_TOKENS,
    ) as (keyof typeof SUPPORTED_TOKENS)[]) {
      expect(getSupportedTokenAddress(symbol)).toBe(SUPPORTED_TOKENS[symbol])
    }
  })

  it('does not offer tokens that are not settled on L1', () => {
    // Portal pays the L1 registrar directly and has no smart account to bridge
    // with, so an off-L1 token would take the user's money and leave nothing on
    // L1 to pay with. `USDC_BASE` is Base Sepolia USDC, funded via the HCA.
    expect(isSupportedTokenSymbol('USDC_BASE')).toBe(false)
    expect(getSupportedTokenAddress('USDC_BASE')).toBeUndefined()
  })

  it('returns undefined for any shared token portal does not offer', () => {
    // `TOKENS` is shared with the manager and may grow again. Anything added
    // there must resolve to `undefined` here until portal deliberately opts in,
    // rather than indexing into a map that has no entry for it.
    const notOffered = ALL_SHARED_SYMBOLS.filter(
      (symbol) => !isSupportedTokenSymbol(symbol),
    )

    for (const symbol of notOffered) {
      expect(getSupportedTokenAddress(symbol)).toBeUndefined()
    }
  })
})
