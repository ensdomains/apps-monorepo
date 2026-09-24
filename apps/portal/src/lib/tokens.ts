import { chain } from '@/config'

const { usdc, dai } = chain.contracts

/**
 * Addresses come from the chain. Decimals and symbols are the only things
 * ensjs does not carry, so they are the only things declared here.
 *
 * The registrar's settleable subset is `@/lib/constants/tokens`, which owns
 * the portal's `SUPPORTED_TOKENS`.
 */
export const TOKENS = {
  USDC: { address: usdc.address, decimals: 6, symbol: 'USDC' },
  DAI: { address: dai.address, decimals: 18, symbol: 'DAI' },
} as const
