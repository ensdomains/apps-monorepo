import { getDestinationContracts } from '@ens-apps/smart-account'
import {
  type CowSellToken,
  quoteEthPaymentActor,
  quoteEthSwapGasReserve,
  readEthUsdPrice,
  type EthPaymentQuote as SwapQuote,
} from '@ens-apps/transaction-manager'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { keepPreviousData } from '@tanstack/react-query'
import { errAsync, okAsync, ResultAsync } from 'neverthrow'
import type { Address } from 'viem'
import { erc20Abi } from 'viem'
import { chain } from '@/config'
import { publicClient } from '@/lib/wagmi'

/** What paying with a selected CoW token asks of the wallet. */
export type EthPaymentQuote = SwapQuote &
  Readonly<{
    /** The wallet's selected-token balance in base units. */
    walletBalance: bigint
    /** ETH (wei) the swap step also keeps back for gas; `0n` while the swap alone is unaffordable. */
    gasReserve: bigint
    /** Chainlink ETH/USD (8 decimals), present only for native ETH. */
    ethUsd?: bigint
  }>

export type EthPaymentQuoteParams = Readonly<{
  owner: Address | null | undefined
  receiver: Address | null | undefined
  sellToken: CowSellToken | undefined
  /** USDC (6dp) CoW delivers; `undefined` until the budget is quoted. */
  permitValue: bigint | undefined
  /** Off where the route has no permit to fund. */
  isEnabled: boolean
  /** EOA registration quotes include the permit + commit solver work. */
  includeRegistrationHooks?: boolean
  fundingMode?: 'exact' | 'topUp'
}>

/** The ETH payment could not be quoted, or the wallet's ETH read. */
export class EthPaymentQuoteError extends TaggedError('EthPaymentQuoteError')<{
  cause: unknown
}> {}

const getEthPaymentQuote = ({
  owner,
  receiver,
  sellToken,
  permitValue,
  includeRegistrationHooks,
  fundingMode,
}: EthPaymentQuoteParams): ResultAsync<
  EthPaymentQuote,
  EthPaymentQuoteError
> => {
  if (!owner || !receiver || !sellToken || permitValue === undefined) {
    return errAsync(
      new EthPaymentQuoteError({
        cause: 'No wallet, receiver, token, or amount.',
      }),
    )
  }
  return ResultAsync.combine([
    (fundingMode === 'topUp'
      ? ResultAsync.fromPromise(
          publicClient.readContract({
            address: getDestinationContracts(chain.id).usdc,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [receiver],
          }),
          (cause) => cause,
        ).map((balance) => (permitValue > balance ? permitValue - balance : 0n))
      : okAsync(permitValue)
    ).andThen((amount) =>
      quoteEthPaymentActor({
        owner,
        hca: receiver,
        permitValue: amount,
        publicClient,
        chainId: chain.id,
        sellToken,
        includeRegistrationHooks,
      }),
    ),
    ResultAsync.fromPromise(
      sellToken.isNative
        ? publicClient.getBalance({ address: owner })
        : publicClient.readContract({
            address: sellToken.address,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [owner],
          }),
      (cause) => cause,
    ),
    sellToken.isNative
      ? readEthUsdPrice({
          publicClient,
          chainId: chain.id,
          nowSeconds: BigInt(Math.floor(Date.now() / 1000)),
        })
      : okAsync(undefined),
  ])
    .andThen(([quote, walletBalance, ethUsd]) =>
      // Estimating gas for a swap the wallet can't fund fails, and the row is short anyway.
      sellToken.isNative &&
      quote.swap &&
      walletBalance >= quote.swap.maximumSell
        ? quoteEthSwapGasReserve({
            publicClient,
            chainId: chain.id,
            owner,
            swap: quote.swap,
          }).map((gasReserve) => ({
            ...quote,
            walletBalance,
            gasReserve,
            ethUsd,
          }))
        : okAsync({ ...quote, walletBalance, gasReserve: 0n, ethUsd }),
    )
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
      receiver: params.receiver ?? undefined,
      sellToken: params.sellToken?.address,
      permitValue: params.permitValue?.toString(),
      includeRegistrationHooks: params.includeRegistrationHooks,
      fundingMode: params.fundingMode,
    }),
    queryFn: () => getEthPaymentQuote(params),
    enabled:
      params.isEnabled &&
      !!params.owner &&
      !!params.receiver &&
      !!params.sellToken &&
      params.permitValue !== undefined &&
      params.permitValue > 0n,
    retry: false,
    // A re-keyed quote shows the last one meanwhile; callers must not pay on it.
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    refetchInterval: 30_000,
  })
