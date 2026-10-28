import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import type { QueryClient } from '@tanstack/react-query'
import { fromPromise, ok } from 'neverthrow'
import type { Address } from 'viem'
import { chain } from '@/config'
import { loadStoredRegistration } from '@/features/register-v2/service/registrationPersistence'
import {
  type LeftoverFunds,
  readLeftoverFunds,
} from '@/features/wallet/service/leftoverFunds'
import { findRegistrationHoldingFunds } from '@/features/wallet/service/pendingRegistration'
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

export type LeftoverFundsStatus = LeftoverFunds & {
  /** A registration waiting to complete that still needs the funds. */
  readonly heldForRegistration: string | null
}

/** The registration stored in this browser that needs the account's USDC, if any. */
export const findPendingRegistrationFor = (hca: Address) =>
  findRegistrationHoldingFunds({
    hca,
    chainId: chain.id,
    publicClient,
    stored: loadStoredRegistration(),
  })

const getLeftoverFunds = ResultFn(async function* (
  params: LeftoverFundsQueryParams,
) {
  if (!params.hca) return ok(null)
  const [leftover, heldForRegistration] = yield* fromPromise(
    Promise.all([
      readLeftoverFunds(publicClient, params.hca),
      findPendingRegistrationFor(params.hca),
    ]),
    (cause) => new ReadLeftoverFundsError({ cause }),
  )
  return ok({ ...leftover, heldForRegistration } satisfies LeftoverFundsStatus)
})

/**
 * Everything a withdrawal moves: the wallet-scoped balances, and this
 * account's checkout budget quotes. Those net the account's balance off the
 * wallet debit they show, and the funding permit is bounded by that figure,
 * so a cached quote would refuse the permit after a withdrawal.
 */
export const invalidateAfterWithdrawal = (
  queryClient: QueryClient,
  hca: Address,
): Promise<unknown> =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: $qk({ $scope: 'wallet' }) }),
    queryClient.invalidateQueries({
      queryKey: $qk({ $scope: 'registration', $action: 'hca-budget', hca }),
    }),
  ])

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
