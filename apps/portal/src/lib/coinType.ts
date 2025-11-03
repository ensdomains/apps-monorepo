export type CoinType = 1 | 10 | 42161 | 8453 | 59144 | 534352

const icons = {
  1: '/icons/eth.svg',
  10: '/icons/op.svg',
  42161: '/icons/arb.svg',
  8453: '/icons/base.svg',
  59144: '/icons/linea.svg',
  534352: '/icons/scroll.svg',
} as const satisfies Record<CoinType, string>

const names = {
  1: 'Ethereum',
  10: 'Optimism',
  42161: 'Arbitrum',
  8453: 'Base',
  59144: 'Linea',
  534352: 'Scroll',
} as const satisfies Record<CoinType, string>

export { icons, names }
