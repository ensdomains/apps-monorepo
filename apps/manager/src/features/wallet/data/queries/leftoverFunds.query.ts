import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { fromPromise, ok } from 'neverthrow'
import type { Address } from 'viem'
import { readLeftoverFunds } from '@/features/wallet/service/leftoverFunds'
import { publicClient } from '@/lib/wagmi'

export class ReadLeftoverFundsError extends TaggedError(
  'ReadLeftoverFundsError',
)<{
  readonly cause: unknown
}> {}

export interface LeftoverFundsQueryParams {
  /** The smart account, or `null` off the smart-account route. */
  readonly hca: Address | null
}

const getLeftoverFunds = ResultFn(async function* (
  params: LeftoverFundsQueryParams,
) {
  if (!params.hca) return ok(null)
  const leftover = yield* fromPromise(
    readLeftoverFunds(publicClient, params.hca),
    (cause) => new ReadLeftoverFundsError({ cause }),
  )
  return ok(leftover)
})

/** What the smart account holds after its payments. */
export const getLeftoverFundsQueryOptions = (
  params: LeftoverFundsQueryParams,
) =>
  resultQueryOptions({
    // Wallet-scoped so a withdrawal's `$scope: 'wallet'` invalidation covers it.
    queryKey: $qk({
      $scope: 'wallet',
      $action: 'leftoverFunds',
      hca: params.hca,
    }),
    queryFn: () => getLeftoverFunds(params),
    enabled: !!params.hca,
  })
