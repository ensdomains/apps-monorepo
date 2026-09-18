import { formatEther } from 'viem'

/**
 * Wei as a short ETH string. Gas figures are tiny, so `formatEther` alone gives
 * an unreadable 18-decimal number.
 */
export const formatGasEth = (wei: bigint): string =>
  Number(formatEther(wei)).toLocaleString('en-US', {
    maximumSignificantDigits: 4,
  })
