import {
  quoteEthPaymentActor,
  type EthPaymentQuote as SwapQuote,
} from '@ens-apps/transaction-manager'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { keepPreviousData } from '@tanstack/react-query'
import { errAsync, ResultAsync } from 'neverthrow'
import type { Address } from 'viem'
import { chain } from '@/config'
import { publicClient } from '@/lib/wagmi'

/** What paying with ETH asks of the wallet, and the ETH it holds. */
export type EthPaymentQuote = SwapQuote &
  Readonly<{
    /** The wallet's ETH (wei). */
    walletBalance: bigint
  }>

export type EthPaymentQuoteParams = Readonly<{
  owner: Address | null | undefined
  /** USDC (6dp) the permit moves; `undefined` until the budget is quoted. */
  permitValue: bigint | undefined
  /** Off where the route has no permit to fund. */
  isEnabled: boolean
}>

/** The ETH payment could not be quoted, or the wallet's ETH read. */
export class EthPaymentQuoteError extends TaggedError('EthPaymentQuoteError')<{
  cause: unknown
}> {}

const getEthPaymentQuote = ({
  owner,
  permitValue,
}: EthPaymentQuoteParams): ResultAsync<
  EthPaymentQuote,
  EthPaymentQuoteError
> => {
  if (!owner || permitValue === undefined) {
    return errAsync(new EthPaymentQuoteError({ cause: 'No wallet or amount.' }))
  }
  return ResultAsync.combine([
    quoteEthPaymentActor({
      owner,
      permitValue,
      publicClient,
      chainId: chain.id,
    }),
    ResultAsync.fromPromise(
      publicClient.getBalance({ address: owner }),
      (cause) => cause,
    ),
  ])
    .map(([quote, walletBalance]) => ({ ...quote, walletBalance }))
    .mapErr((cause) => new EthPaymentQuoteError({ cause }))
}

/**
 * The ETH a registration would ask the wallet to swap. Quotes move with the
 * ETH price, so it refreshes; the run re-quotes before the wallet is asked
 * anyway, and refuses to send materially more than this showed.
 */
export const getEthPaymentQuoteQueryOptions = (params: EthPaymentQuoteParams) =>
  resultQueryOptions({
    queryKey: $qk({
      $scope: 'registration',
      $action: 'eth-payment-quote',
      owner: params.owner ?? undefined,
      permitValue: params.permitValue?.toString(),
    }),
    queryFn: () => getEthPaymentQuote(params),
    enabled:
      params.isEnabled &&
      !!params.owner &&
      params.permitValue !== undefined &&
      params.permitValue > 0n,
    retry: false,
    // A re-keyed quote shows the last one meanwhile; callers must not pay on it.
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    refetchInterval: 30_000,
  })
