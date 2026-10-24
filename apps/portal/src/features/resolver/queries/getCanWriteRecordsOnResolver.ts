import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import {
  publicResolverSetAddrSnippet,
  publicResolverSetTextSnippet,
} from '@ensdomains/ensjs-abi/v1/publicResolver'
import { fromPromise, ok } from 'neverthrow'
import { type Address, encodeFunctionData, type Hex, namehash } from 'viem'
import { call } from 'viem/actions'
import { getAction } from 'viem/utils'
import { safeGetClient } from '@/lib/wagmi/helpers'
import { isContractRevert } from '@/utils/errors/isContractRevert'

const ETH_COIN_TYPE = 60n
const PROBE_TEXT_KEY = 'avatar'

class CanWriteRecordsOnResolverError extends TaggedError(
  'CanWriteRecordsOnResolverError',
)<{
  readonly cause: unknown
}> {}

type GetCanWriteRecordsOnResolverParams = {
  readonly resolverAddress: Address
  readonly name: string
  readonly account: Address
}

/** One setter per record type a resolver may authorise separately. */
const encodeProbes = ({
  node,
  account,
}: {
  readonly node: Hex
  readonly account: Address
}): readonly Hex[] => [
  encodeFunctionData({
    abi: publicResolverSetAddrSnippet,
    functionName: 'setAddr',
    args: [node, ETH_COIN_TYPE, account],
  }),
  encodeFunctionData({
    abi: publicResolverSetTextSnippet,
    functionName: 'setText',
    args: [node, PROBE_TEXT_KEY, ''],
  }),
]

/**
 * Whether `account` can write any of `name`'s records, by dry-running the
 * setters a save would send. `false` only when every one reverts; any other
 * failure throws, leaving writability unknown rather than read as a refusal.
 */
export const getCanWriteRecordsOnResolver = ResultFn(async function* ({
  resolverAddress,
  name,
  account,
}: GetCanWriteRecordsOnResolverParams) {
  const client = yield* safeGetClient()

  const probes = encodeProbes({ node: namehash(name), account })

  const accepted = yield* fromPromise(
    Promise.all(
      probes.map((data) =>
        getAction(
          client,
          call,
          'call',
        )({ account, to: resolverAddress, data }).then(
          () => true,
          (error: unknown) => {
            if (isContractRevert(error)) return false
            throw error
          },
        ),
      ),
    ),
    (cause) => new CanWriteRecordsOnResolverError({ cause }),
  )

  return ok(accepted.some(Boolean))
})

const getCanWriteRecordsOnResolverQueryKey = createQueryKey<
  'can-write-records-on-resolver',
  GetCanWriteRecordsOnResolverParams
>('can-write-records-on-resolver')

export const getCanWriteRecordsOnResolverQueryOptions = (
  params: GetCanWriteRecordsOnResolverParams,
) =>
  resultQueryOptions({
    queryKey: getCanWriteRecordsOnResolverQueryKey(params),
    queryFn: ({ queryKey: [, queryParams] }) =>
      getCanWriteRecordsOnResolver(queryParams),
  })
