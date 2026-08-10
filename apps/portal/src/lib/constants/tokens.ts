import type { TOKEN_SYMBOL } from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { TOKENS } from '@ens-apps/transaction-manager/contracts/ens-sepolia'

export const USDC_DECIMALS = TOKENS.USDC.decimals
export const DAI_DECIMALS = TOKENS.DAI.decimals

export const SUPPORTED_TOKENS_SYMBOLS = {
  USDC: 'USDC',
  DAI: 'DAI',
} as const

export type SupportedTokenSymbol =
  (typeof SUPPORTED_TOKENS_SYMBOLS)[keyof typeof SUPPORTED_TOKENS_SYMBOLS]

export const SUPPORTED_TOKENS = {
  [SUPPORTED_TOKENS_SYMBOLS.USDC]: TOKENS.USDC.address,
  [SUPPORTED_TOKENS_SYMBOLS.DAI]: TOKENS.DAI.address,
} as const

/**
 * Whether portal offers this token.
 *
 * Portal pays the L1 registrar directly and has no smart account — no HCA is
 * planned for it — so it can only accept tokens the L1 registrar settles
 * itself. It cannot bridge, and it cannot be funded from another chain.
 *
 * `TOKENS` is shared with the manager, which does have those routes, so it is
 * deliberately wider: `USDC_BASE` is Base Sepolia USDC that the HCA bridges to
 * L1 before paying. `TOKEN_SYMBOL` therefore carries symbols portal must never
 * accept, and every crossing from that union into portal's tables has to
 * narrow first — the union widens silently whenever a token is added.
 */
export const isSupportedTokenSymbol = (
  symbol: TOKEN_SYMBOL,
): symbol is SupportedTokenSymbol => symbol in SUPPORTED_TOKENS

/**
 * Portal's address for a shared token symbol, or `undefined` when portal does
 * not offer it. Prefer this over indexing `SUPPORTED_TOKENS` with a
 * `TOKEN_SYMBOL`: the map covers only portal's subset, so a direct index is
 * both a type error and a silent `undefined` at runtime.
 */
export const getSupportedTokenAddress = (symbol: TOKEN_SYMBOL) =>
  isSupportedTokenSymbol(symbol) ? SUPPORTED_TOKENS[symbol] : undefined
