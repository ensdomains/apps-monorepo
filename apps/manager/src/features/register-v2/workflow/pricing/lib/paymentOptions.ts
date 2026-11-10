import { match, P } from 'ts-pattern'
import type { L2Source } from '@/l2Sources'
import type { L2Wallets } from '../../../data/queries/l2Balances.query'

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

// A balance must exceed what the HCA is sent: the route's fee comes on top.
const getStatus = (
  amountRaw: bigint | null,
  isLoaded: boolean,
  balanceRaw: bigint | null,
): L2PaymentOptionStatus =>
  match({ amountRaw, isLoaded, balanceRaw })
    .returnType<L2PaymentOptionStatus>()
    .with({ amountRaw: null }, { isLoaded: false }, () => 'loading')
    .with({ balanceRaw: null }, () => 'unavailable')
    // Nothing to bridge: the account's credit already covers the registration.
    .with({ amountRaw: 0n }, () => 'available')
    .with({ amountRaw: P.bigint, balanceRaw: P.bigint }, (option) =>
      option.balanceRaw > option.amountRaw ? 'available' : 'insufficient',
    )
    .exhaustive()

/**
 * The wallet holds no USDC there. With nothing to bridge such an option still
 * reads as `available`, and its quote as `0n`, which it would otherwise cover.
 */
export const isL2OptionEmpty = (option: L2PaymentOption): boolean =>
  option.balanceRaw === 0n

/**
 * The chosen L2's chain id, while the wallet holds something there and there
 * is something to bridge (`amountRaw`, when known). An emptied one is no
 * choice at all, and with nothing to bridge the account pays it all, so either
 * way the wallet's coin pays in its place.
 */
export const getSelectedL2ChainId = (
  options: readonly L2PaymentOption[],
  chainId: number | undefined,
  amountRaw?: bigint | null,
): number | undefined =>
  amountRaw === 0n
    ? undefined
    : options.find(
        (option) =>
          option.source.chain.id === chainId && !isL2OptionEmpty(option),
      )?.source.chain.id

/**
 * The chosen method pays in the USDC ETH buys and L2s bridge (Circle's, on
 * Sepolia): ETH, or the chosen L2 even once nothing is left to bridge, as the
 * account then pays from what it holds of that USDC. An emptied L2 gives way
 * to the wallet's coin, as on screen.
 */
export const isCirclePaymentMethod = ({
  isPaidWithEth,
  l2ChainId,
  l2Wallets,
}: {
  readonly isPaidWithEth: boolean
  /** The L2 picked, whether or not it has anything to bridge. */
  readonly l2ChainId: number | undefined
  /** Unread, or a failed read, counts as holding something, like an L2 option. */
  readonly l2Wallets: Readonly<L2Wallets> | undefined
}): boolean =>
  isPaidWithEth ||
  (l2ChainId !== undefined && l2Wallets?.[l2ChainId]?.usdc !== 0n)

/**
 * One row per L2 source. `amountRaw`, what paying from an L2 sends the HCA, is
 * `null` until the registration's cost is quoted; a `null` balance is a failed
 * read.
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
