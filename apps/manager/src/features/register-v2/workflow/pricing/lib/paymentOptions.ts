import { L2_BRIDGE_MIN_AMOUNT_OUT } from '@ens-apps/smart-account'
import type { L2Source } from '@/l2Sources'

/** The payment row for USDC bridged in from an L2. */
type L2PaymentOptionId = `l2:${number}:usdc`

export const l2PaymentOptionId = (chainId: number): L2PaymentOptionId =>
  `l2:${chainId}:usdc`

/**
 * What must be bridged for the wallet to cover `walletDebitRaw`: the shortfall,
 * raised to the bridge minimum. Zero when the wallet already covers it.
 */
export const getL2BridgeAmount = ({
  walletDebitRaw,
  walletBalanceRaw,
}: {
  readonly walletDebitRaw: bigint
  readonly walletBalanceRaw: bigint
}): bigint => {
  const shortfall = walletDebitRaw - walletBalanceRaw
  if (shortfall <= 0n) return 0n
  return shortfall > L2_BRIDGE_MIN_AMOUNT_OUT
    ? shortfall
    : L2_BRIDGE_MIN_AMOUNT_OUT
}

type L2PaymentOptionStatus =
  | 'not-needed'
  | 'loading'
  | 'unavailable'
  | 'insufficient'
  | 'available'

export type L2PaymentOption = Readonly<{
  id: L2PaymentOptionId
  source: L2Source
  balanceRaw: bigint | null
  status: L2PaymentOptionStatus
}>

// A balance must exceed the bridge amount: the bridge fee is paid on top.
const getStatus = (
  bridgeAmountRaw: bigint | null,
  isLoaded: boolean,
  balanceRaw: bigint | null,
): L2PaymentOptionStatus => {
  if (bridgeAmountRaw === 0n) return 'not-needed'
  if (bridgeAmountRaw === null || !isLoaded) return 'loading'
  if (balanceRaw === null) return 'unavailable'
  return balanceRaw > bridgeAmountRaw ? 'available' : 'insufficient'
}

/**
 * One row per L2 source. `bridgeAmountRaw` is `null` while the wallet debit is
 * unknown; a `null` balance is a failed read.
 */
export const getL2PaymentOptions = ({
  sources,
  balances,
  bridgeAmountRaw,
}: {
  readonly sources: readonly L2Source[]
  readonly balances: Readonly<Record<number, bigint | null>> | undefined
  readonly bridgeAmountRaw: bigint | null
}): readonly L2PaymentOption[] =>
  sources.map((source) => {
    const balanceRaw = balances?.[source.chain.id] ?? null
    return {
      id: l2PaymentOptionId(source.chain.id),
      source,
      balanceRaw,
      status: getStatus(bridgeAmountRaw, balances !== undefined, balanceRaw),
    }
  })
