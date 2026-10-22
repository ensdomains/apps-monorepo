import type { PermitKind } from '@ens-apps/transaction-manager'
import { chain, envConfig } from '@/config'

const { usdc, dai } = chain.contracts

/**
 * Mainnet DAI predates EIP-2612 and has only its own legacy `permit`. Sepolia's
 * DAI is a mock that implements EIP-2612, so it takes the standard path.
 */
const daiPermitKind: PermitKind =
  envConfig.network === 'mainnet' ? 'dai-legacy' : 'eip2612'

/**
 * Addresses come from the chain. Decimals, symbols and permit shapes are the
 * only things ensjs does not carry, so they are the only things declared here.
 */
export const TOKENS = {
  USDC: {
    address: usdc.address,
    decimals: 6,
    symbol: 'USDC',
    permitKind: 'eip2612' as PermitKind,
  },
  DAI: {
    address: dai.address,
    decimals: 18,
    symbol: 'DAI',
    permitKind: daiPermitKind,
  },
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
 * The renewal tokens offered: the same set registration offers. DAI stays in
 * `RENEWAL_TOKENS` because the renewers settle it, but it does not work with
 * the HCA, so it is not shown.
 */
export const RENEWAL_TOKEN_SYMBOLS: readonly RENEWAL_TOKEN[] = Object.keys(
  SUPPORTED_TOKENS,
) as SUPPORTED_TOKEN[]
