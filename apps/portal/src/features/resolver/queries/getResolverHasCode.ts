import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { fromPromise, ok } from 'neverthrow'
import type { Address } from 'viem'
import { getCode } from 'viem/actions'
import { getAction } from 'viem/utils'
import { safeGetClient } from '@/lib/wagmi/helpers'

class GetResolverHasCodeError extends TaggedError('GetResolverHasCodeError')<{
  readonly cause: unknown
}> {}

type GetResolverHasCodeParams = {
  readonly resolverAddress: Address
}

/**
 * Whether the resolver is a contract at all. A name's resolver can be set to
 * any address, a wallet included, and a call to an account with no code
 * "succeeds" with empty return data, so the write dry runs read it as
 * writable.
 */
export const getResolverHasCode = ResultFn(async function* ({
  resolverAddress,
}: GetResolverHasCodeParams) {
  const client = yield* safeGetClient()
  const code = yield* fromPromise(
    getAction(client, getCode, 'getCode')({ address: resolverAddress }),
    (cause) => new GetResolverHasCodeError({ cause }),
  )
  // viem returns `undefined` for an account with no code.
  return ok(code !== undefined && code !== '0x')
})

const getResolverHasCodeQueryKey = createQueryKey<
  'resolver-has-code',
  GetResolverHasCodeParams
>('resolver-has-code')

export const getResolverHasCodeQueryOptions = (
  params: GetResolverHasCodeParams,
) =>
  resultQueryOptions({
    queryKey: getResolverHasCodeQueryKey(params),
    queryFn: ({ queryKey: [, queryParams] }) => getResolverHasCode(queryParams),
  })
