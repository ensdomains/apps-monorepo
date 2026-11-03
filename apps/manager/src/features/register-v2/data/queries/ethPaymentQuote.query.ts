import {
  type EthDepositQuote,
  quoteEthDepositActor,
  type Signer,
} from '@ens-apps/transaction-manager'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { keepPreviousData } from '@tanstack/react-query'
import { errAsync, ResultAsync } from 'neverthrow'
import type { Address } from 'viem'
import { publicClient } from '@/lib/wagmi'

/** What paying the shortfall with ETH asks of the wallet, and what it holds. */
export type EthPaymentQuote = EthDepositQuote &
  Readonly<{
    /** The wallet's ETH (wei). */
    walletBalance: bigint
  }>

export type EthPaymentQuoteParams = Readonly<{
  signer: Signer | null | undefined
  hca: Address | null | undefined
  owner: Address | null | undefined
  /** USDC (6dp) the HCA is short; `undefined` until the budget is quoted. */
  amountOut: bigint | undefined
}>

/** The ETH payment could not be quoted, or the wallet's ETH read. */
export class EthPaymentQuoteError extends TaggedError('EthPaymentQuoteError')<{
  cause: unknown
}> {}

const getEthPaymentQuote = ({
  signer,
  hca,
  owner,
  amountOut,
}: EthPaymentQuoteParams): ResultAsync<
  EthPaymentQuote,
  EthPaymentQuoteError
> => {
  if (!signer || !hca || !owner || amountOut === undefined) {
    return errAsync(
      new EthPaymentQuoteError({ cause: 'No connected ENS account.' }),
    )
  }
  return ResultAsync.combine([
    quoteEthDepositActor({ hca, amountOut, signer, publicClient }),
    ResultAsync.fromPromise(
      publicClient.getBalance({ address: owner }),
      (cause) => cause,
    ),
  ])
    .map(([quote, walletBalance]) => ({ ...quote, walletBalance }))
    .mapErr((cause) => new EthPaymentQuoteError({ cause }))
}

/**
 * The ETH a registration would ask the wallet to send. Quotes move with the
 * ETH price, so it refreshes; the run re-quotes before the wallet is asked
 * anyway, and refuses to send materially more than this showed.
 */
export const getEthPaymentQuoteQueryOptions = (params: EthPaymentQuoteParams) =>
  resultQueryOptions({
    queryKey: $qk({
      $scope: 'registration',
      $action: 'eth-payment-quote',
      hca: params.hca ?? undefined,
      owner: params.owner ?? undefined,
      amountOut: params.amountOut?.toString(),
    }),
    queryFn: () => getEthPaymentQuote(params),
    enabled:
      params.signer?.type === 'rhinestone' &&
      !!params.hca &&
      !!params.owner &&
      params.amountOut !== undefined &&
      params.amountOut > 0n,
    retry: false,
    // A re-keyed quote shows the last one meanwhile; callers must not pay on it.
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    refetchInterval: 30_000,
  })
