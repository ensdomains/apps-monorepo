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

/** How far the wallet is from covering the swap and its gas, as shown; undefined when it covers them. */
export const getEthShortfallFigures = (row: EthPaymentRow) => {
  const { chargeRaw, balanceRaw, gasReserveRaw } = row
  if (chargeRaw === undefined || balanceRaw === undefined) return undefined
  if (!isEthShortOfFunds(row)) return undefined
  const needed = chargeRaw + gasReserveRaw
  return {
    short: formatGasEth(needed - balanceRaw),
    needed: formatGasEth(needed),
    held: formatGasEth(balanceRaw),
  }
}

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
