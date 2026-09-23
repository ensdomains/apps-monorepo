import { chain } from '@/config'

const { usdc, dai } = chain.contracts

/**
 * Addresses come from the chain. Decimals and symbols are the only things
 * ensjs does not carry, so they are the only things declared here.
 */
export const TOKENS = {
  USDC: { address: usdc.address, decimals: 6, symbol: 'USDC' },
  DAI: { address: dai.address, decimals: 18, symbol: 'DAI' },
} as const

/**
 * What the v2 registrar actually settles (its `PAYMENT_TOKEN` /
 * `SECONDARY_PAYMENT_TOKEN` slots). DAI is deliberately absent: offering it in
 * a picker produces quotes the registrar rejects at settlement.
 */
export const SUPPORTED_TOKENS = { USDC: TOKENS.USDC.address } as const

export type SUPPORTED_TOKEN = keyof typeof SUPPORTED_TOKENS
