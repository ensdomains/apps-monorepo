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

/** Any stable the app can price in or show a balance for. */
export type TOKEN_SYMBOL = keyof typeof TOKENS

/**
 * What the v2 registrar actually settles (its `PAYMENT_TOKEN` /
 * `SECONDARY_PAYMENT_TOKEN` slots). DAI is deliberately absent: offering it in
 * a picker produces quotes the registrar rejects at settlement.
 */
export const SUPPORTED_TOKENS = { USDC: TOKENS.USDC.address } as const

export type SUPPORTED_TOKEN = keyof typeof SUPPORTED_TOKENS

/**
 * What renewals can pay in: every stable ensjs maps for the chain. Both renewers
 * settle each of them, DAI included (renewed in each on a Sepolia fork).
 */
export const RENEWAL_TOKENS = {
  USDC: TOKENS.USDC.address,
  DAI: TOKENS.DAI.address,
} as const

export type RENEWAL_TOKEN = keyof typeof RENEWAL_TOKENS

export const RENEWAL_TOKEN_SYMBOLS = Object.keys(
  RENEWAL_TOKENS,
) as readonly RENEWAL_TOKEN[]
