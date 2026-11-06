import { ethToUsdcRaw } from '@ens-apps/transaction-manager'
import { formatGasEth } from '@ens-apps/utils/formatGasEth'
import { formatUnits } from 'viem'
import type { EthPaymentRow } from '../components/EthPaymentListItem'

const USDC_DECIMALS = 6

export const weiToUsd = (wei: bigint, ethUsd: bigint) =>
  Number(formatUnits(ethToUsdcRaw(wei, ethUsd), USDC_DECIMALS))

export const isEthShortOfFunds = ({
  chargeRaw,
  balanceRaw,
  gasReserveRaw,
}: EthPaymentRow) =>
  chargeRaw !== undefined &&
  balanceRaw !== undefined &&
  balanceRaw < chargeRaw + gasReserveRaw

/** The row can pay: quoted, and the wallet holds what it would send. */
export const canPayWithEth = (row: EthPaymentRow) =>
  row.chargeRaw !== undefined &&
  !row.isQuoteLoading &&
  !row.hasQuoteFailed &&
  !isEthShortOfFunds(row)

/** The ETH the wallet is short of the swap and its gas, as shown; undefined when it covers them. */
export const getEthShortfall = (row: EthPaymentRow): string | undefined => {
  const { chargeRaw, balanceRaw, gasReserveRaw } = row
  if (chargeRaw === undefined || balanceRaw === undefined) return undefined
  if (!isEthShortOfFunds(row)) return undefined
  return formatGasEth(chargeRaw + gasReserveRaw - balanceRaw)
}

/** The most the swap sends, in USDC (6dp); undefined until quoted and priced, or with nothing to swap. */
export const getEthSwapDebitUsdcRaw = ({
  chargeRaw,
  ethUsdRaw,
}: Pick<EthPaymentRow, 'chargeRaw' | 'ethUsdRaw'>): bigint | undefined =>
  chargeRaw === undefined || chargeRaw === 0n || ethUsdRaw === undefined
    ? undefined
    : ethToUsdcRaw(chargeRaw, ethUsdRaw)

/** The ETH row, from its quote. With the HCA already funded, nothing is sent. */
export const getEthPaymentRow = (
  quote: {
    readonly data?: {
      readonly swap?: { readonly maximumEth: bigint }
      readonly walletBalance: bigint
      readonly gasReserve: bigint
      readonly ethUsd: bigint
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
