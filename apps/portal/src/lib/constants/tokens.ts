export const USDC_DECIMALS = 6
export const DAI_DECIMALS = 18

export const SUPPORTED_TOKENS_SYMBOLS = {
  USDC: 'USDC',
  DAI: 'DAI',
} as const

export type SupportedTokenSymbol =
  (typeof SUPPORTED_TOKENS_SYMBOLS)[keyof typeof SUPPORTED_TOKENS_SYMBOLS]

export const SUPPORTED_TOKENS = {
  [SUPPORTED_TOKENS_SYMBOLS.USDC]: '0x2c3d8dfac22def2947e94432bcd6bb51e1ac55e6',
  [SUPPORTED_TOKENS_SYMBOLS.DAI]: '0xd030a2465ee661338de1f02d05042bbf20d5d127',
} as const
