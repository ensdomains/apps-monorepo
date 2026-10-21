import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { permissionedResolverGetRecordIdSnippet } from '@ensdomains/ensjs-abi/v2/permissionedResolver'
import { fromPromise, ok } from 'neverthrow'
import type { Address, Hex } from 'viem'
import { multicall } from 'viem/actions'
import { getAction } from 'viem/utils'
import { safeGetClient } from '@/lib/wagmi/helpers'

class GetNodesWithRecordsError extends TaggedError('GetNodesWithRecordsError')<{
  cause: unknown
}> {}

type GetNodesWithRecordsParameters = {
  readonly address: Address
  readonly nodes: readonly Hex[]
}

const getNodesWithRecords = ResultFn(async function* ({
  address,
  nodes,
}: GetNodesWithRecordsParameters) {
  const client = yield* safeGetClient()
  const multicallAction = getAction(client, multicall, 'multicall')

  const recordIds = yield* fromPromise(
    multicallAction({
      contracts: nodes.map((node) => ({
        address,
        abi: permissionedResolverGetRecordIdSnippet,
        functionName: 'getRecordId',
        args: [node],
      })),
      allowFailure: false,
    }),
    (cause) => new GetNodesWithRecordsError({ cause }),
  )

  return ok(nodes.filter((_, index) => recordIds[index] !== 0n))
})

export const NODES_WITH_RECORDS = 'get-nodes-with-records'

const getNodesWithRecordsQueryKey = createQueryKey<
  typeof NODES_WITH_RECORDS,
  GetNodesWithRecordsParameters
>(NODES_WITH_RECORDS)

/** Which of `nodes` have a record on the resolver; `linkToNode` reverts `InvalidRecord` for the rest. */
export const getNodesWithRecordsQueryOptions = (
  params: GetNodesWithRecordsParameters,
) =>
  resultQueryOptions({
    queryKey: getNodesWithRecordsQueryKey(params),
    queryFn: () => getNodesWithRecords(params),
  })
