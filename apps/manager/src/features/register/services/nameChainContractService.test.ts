import { describe, expect, it, vi } from 'vitest'

vi.mock('@ens-apps/transaction-manager', () => ({}))

import {
  DEFAULT_PAYMENT_TOKEN,
  EMPTY_ADDRESS,
  NameChainContractError,
  REFERER_ADDRESS,
  SUPPORTED_TOKENS,
} from './nameChainContractService'

describe('nameChainContractService', () => {
  describe('constants', () => {
    it('exports EMPTY_ADDRESS as zero address', () => {
      expect(EMPTY_ADDRESS).toBe('0x0000000000000000000000000000000000000000')
    })

    it('exports REFERER_ADDRESS', () => {
      expect(REFERER_ADDRESS).toBeDefined()
      expect(typeof REFERER_ADDRESS).toBe('string')
    })

    it('exports SUPPORTED_TOKENS with USDC and DAI addresses', () => {
      expect(SUPPORTED_TOKENS.USDC).toBeDefined()
      expect(SUPPORTED_TOKENS.DAI).toBeDefined()
      expect(SUPPORTED_TOKENS.USDC).toMatch(/^0x/)
      expect(SUPPORTED_TOKENS.DAI).toMatch(/^0x/)
    })

    it('DEFAULT_PAYMENT_TOKEN is USDC', () => {
      expect(DEFAULT_PAYMENT_TOKEN).toBe(SUPPORTED_TOKENS.USDC)
    })
  })

  describe('NameChainContractError', () => {
    it('is an instance of Error', () => {
      const err = new NameChainContractError({ cause: new Error('test') })
      expect(err).toBeInstanceOf(Error)
      expect(err).toBeInstanceOf(NameChainContractError)
    })

    it('preserves cause', () => {
      const cause = new Error('underlying')
      const err = new NameChainContractError({ cause })
      expect(err.cause).toBe(cause)
    })
  })
})
