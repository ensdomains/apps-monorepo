import type { EthPaymentRow } from '../components/EthPaymentListItem'

/** The ETH row, from its quote. With the HCA already funded, nothing is sent. */
export const getEthPaymentRow = (
  quote: {
    readonly data?: {
      readonly swap?: { readonly maximumEth: bigint }
      readonly walletBalance: bigint
      readonly gasReserve: bigint
      readonly ethUsd?: bigint
    }
    readonly isPending: boolean
    readonly isPlaceholderData: boolean
    readonly isError: boolean
  },
  walletDebitRaw: bigint | undefined,
): EthPaymentRow =>
  walletDebitRaw === 0n
    ? {
        chargeRaw: 0n,
        balanceRaw: undefined,
        gasReserveRaw: 0n,
        ethUsdRaw: undefined,
        isQuoteLoading: false,
        hasQuoteFailed: false,
      }
    : {
        // No swap: the wallet already holds the USDC.
        chargeRaw:
          quote.data === undefined
            ? undefined
            : (quote.data.swap?.maximumEth ?? 0n),
        balanceRaw: quote.data?.walletBalance,
        gasReserveRaw: quote.data?.gasReserve ?? 0n,
        ethUsdRaw: quote.data?.ethUsd,
        // A placeholder belongs to another amount: shown, never paid on.
        isQuoteLoading: quote.isPending || quote.isPlaceholderData,
        hasQuoteFailed: quote.isError,
      }
