import { match } from 'ts-pattern'
import {
  DAI_DECIMALS,
  SUPPORTED_TOKENS,
  USDC_DECIMALS,
} from '@/lib/constants/tokens'
import type { SupportedTokenAddresses } from '../types/tokens'

/**
 * Returns the decimals for a supported registration payment token.
 * @throws Error if the token address is not USDC or DAI
 */
export function getTokenDecimals(token: SupportedTokenAddresses): number {
  const normalized = token.toLowerCase()

  return match(normalized)
    .with(SUPPORTED_TOKENS.USDC.toLowerCase(), () => USDC_DECIMALS)
    .with(SUPPORTED_TOKENS.DAI.toLowerCase(), () => DAI_DECIMALS)
    .otherwise(() => {
      throw new Error(`Unsupported token address: ${token}`)
    })
}
