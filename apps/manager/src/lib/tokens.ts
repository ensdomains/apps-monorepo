import { getDestinationContracts } from '@ens-apps/smart-account'
import { chain } from '@/config'

const { dai } = chain.contracts

/**
 * USDC is the HCA route's payment token from the manifest (not ensjs' MockUSDC),
 * so every flow pays in the same token. Decimals and symbols are declared here.
 */
export const TOKENS = {
  USDC: {
    address: getDestinationContracts(chain.id).usdc,
    decimals: 6,
    symbol: 'USDC',
  },
  DAI: { address: dai.address, decimals: 18, symbol: 'DAI' },
} as const

/**
 * What the v2 registrar actually settles (its `PAYMENT_TOKEN` /
 * `SECONDARY_PAYMENT_TOKEN` slots). DAI is deliberately absent: offering it in
 * a picker produces quotes the registrar rejects at settlement.
 */
export const SUPPORTED_TOKENS = { USDC: TOKENS.USDC.address } as const

export type SUPPORTED_TOKEN = keyof typeof SUPPORTED_TOKENS
