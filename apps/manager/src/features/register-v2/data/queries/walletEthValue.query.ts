import { ethToUsdcRaw, readEthUsdPrice } from '@ens-apps/transaction-manager'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { errAsync, ResultAsync } from 'neverthrow'
import type { Address } from 'viem'
import { chain } from '@/config'
import { publicClient } from '@/lib/wagmi'

/** The wallet's ETH, or the ETH price, could not be read. */
export class ReadWalletEthValueError extends TaggedError(
  'ReadWalletEthValueError',
)<{ cause: unknown }> {}

/** The wallet's ETH (wei) and what it is worth in USDC (6 decimals). */
export type WalletEthValue = Readonly<{ weiRaw: bigint; usdcRaw: bigint }>

const getWalletEthValue = (
  owner: Address,
): ResultAsync<WalletEthValue, ReadWalletEthValueError> =>
  ResultAsync.combine([
    ResultAsync.fromPromise(
      publicClient.getBalance({ address: owner }),
      (cause) => cause,
    ),
    readEthUsdPrice({
      publicClient,
      chainId: chain.id,
      nowSeconds: BigInt(Math.floor(Date.now() / 1000)),
    }),
  ])
    .map(([weiRaw, ethUsd]) => ({
      weiRaw,
      usdcRaw: ethToUsdcRaw(weiRaw, ethUsd),
    }))
    .mapErr((cause) => new ReadWalletEthValueError({ cause }))

export const getWalletEthValueQueryOptions = (params: {
  readonly owner: Address | null | undefined
  readonly isEnabled: boolean
}) =>
  resultQueryOptions({
    queryKey: $qk({
      $scope: 'wallet',
      $action: 'eth-value',
      owner: params.owner ?? undefined,
    }),
    queryFn: () =>
      params.owner
        ? getWalletEthValue(params.owner)
        : errAsync(new ReadWalletEthValueError({ cause: 'No wallet.' })),
    enabled: params.isEnabled && !!params.owner,
    refetchInterval: 30_000,
  })
