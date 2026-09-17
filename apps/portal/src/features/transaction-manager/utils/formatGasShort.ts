import { formatEther } from 'viem'

/**
 * Wei as a short ETH string. Gas figures are tiny, so `formatEther` alone gives
 * an unreadable 18-decimal number; three significant digits is enough to act on.
 */
export const formatGasShort = (wei: bigint): string =>
  Number(formatEther(wei)).toLocaleString('en-US', {
    maximumSignificantDigits: 3,
  })
