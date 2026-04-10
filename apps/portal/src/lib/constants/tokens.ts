export const USDC_DECIMALS = 6
export const DAI_DECIMALS = 18

export const SUPPORTED_TOKENS_SYMBOLS = {
  USDC: 'USDC',
  DAI: 'DAI',
} as const

export type SupportedTokenSymbol =
  (typeof SUPPORTED_TOKENS_SYMBOLS)[keyof typeof SUPPORTED_TOKENS_SYMBOLS]

export const SUPPORTED_TOKENS = {
  [SUPPORTED_TOKENS_SYMBOLS.USDC]: '0x302edecc2b8d1f3f4625b8a825a42f9adc102e65',
  [SUPPORTED_TOKENS_SYMBOLS.DAI]: '0xa01e0eb02d0e92f1302e677d7ce7955b35c390d4',
} as const
