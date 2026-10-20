import { chain, isTestnet } from '@/config'

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
 * What registration pays in. The rent oracle accepts DAI too, but the HCA
 * validator's payment tokens (`PAYMENT_TOKEN` / `SECONDARY_PAYMENT_TOKEN`) are
 * both USDC, so a DAI registration would fail validation.
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

/**
 * The renewal tokens offered on this network. DAI is testnet-only: Sepolia's
 * DAI has an EIP-2612 permit, but mainnet DAI has only the legacy DAI permit,
 * so the intent route's DAI funding leg would revert there.
 */
export const RENEWAL_TOKEN_SYMBOLS: readonly RENEWAL_TOKEN[] = isTestnet
  ? ['USDC', 'DAI']
  : ['USDC']
