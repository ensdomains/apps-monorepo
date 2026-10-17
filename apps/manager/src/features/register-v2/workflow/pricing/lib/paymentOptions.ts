import type { L2Source } from '@/l2Sources'

/** The payment row for the registration paid with USDC on an L2. */
type L2PaymentOptionId = `l2:${number}:usdc`

export const l2PaymentOptionId = (chainId: number): L2PaymentOptionId =>
  `l2:${chainId}:usdc`

type L2PaymentOptionStatus =
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

// A balance must exceed the name's price: the intents' fees come on top.
const getStatus = (
  amountRaw: bigint | null,
  isLoaded: boolean,
  balanceRaw: bigint | null,
): L2PaymentOptionStatus => {
  if (amountRaw === null || !isLoaded) return 'loading'
  if (balanceRaw === null) return 'unavailable'
  return balanceRaw > amountRaw ? 'available' : 'insufficient'
}

/**
 * One row per L2 source. `amountRaw`, the name's price, is `null` until it is
 * read; a `null` balance is a failed read.
 */
export const getL2PaymentOptions = ({
  sources,
  balances,
  amountRaw,
}: {
  readonly sources: readonly L2Source[]
  readonly balances: Readonly<Record<number, bigint | null>> | undefined
  readonly amountRaw: bigint | null
}): readonly L2PaymentOption[] =>
  sources.map((source) => {
    const balanceRaw = balances?.[source.chain.id] ?? null
    return {
      id: l2PaymentOptionId(source.chain.id),
      source,
      balanceRaw,
      status: getStatus(amountRaw, balances !== undefined, balanceRaw),
    }
  })
