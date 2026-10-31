import { readHcaSessionNonce } from '@ens-apps/smart-account'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { fromPromise, ok } from 'neverthrow'
import type { Address, PublicClient } from 'viem'

class ReadSessionNonceError extends TaggedError('ReadSessionNonceError')<{
  readonly cause: unknown
}> {}

export interface SessionNonceQueryParams {
  readonly accountAddress: Address | null
  readonly publicClient: PublicClient | undefined
}

/** A revoke on another device shows up within this, and on the next window focus. */
const SESSION_NONCE_REFETCH_MS = 60_000

const getSessionNonce = ResultFn(async function* ({
  accountAddress,
  publicClient,
}: SessionNonceQueryParams) {
  if (!accountAddress || !publicClient) return ok(null)
  const nonce = yield* fromPromise(
    readHcaSessionNonce(publicClient, accountAddress),
    (cause) => new ReadSessionNonceError({ cause }),
  )
  return ok(nonce)
})

/** The account's on-chain session nonce; `null` while it has no code. */
export const getSessionNonceQueryOptions = (params: SessionNonceQueryParams) =>
  resultQueryOptions({
    queryKey: $qk({
      $scope: 'smart-account',
      $action: 'session-nonce',
      hca: params.accountAddress,
    }),
    queryFn: () => getSessionNonce(params),
    enabled: !!params.accountAddress && !!params.publicClient,
    staleTime: SESSION_NONCE_REFETCH_MS,
    refetchInterval: SESSION_NONCE_REFETCH_MS,
    refetchOnWindowFocus: true,
  })
