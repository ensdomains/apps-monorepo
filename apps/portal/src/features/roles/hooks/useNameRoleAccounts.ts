import type { GraphqlRequestError } from '@ens-apps/indexer/urql'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import type {
  GetNameRolesAccountsErrorType,
  GetNameRolesAccountsParameters,
  GetNameRolesAccountsReturnType,
  GetResourceErrorType,
} from '@ensdomains/ensjs/public/v2'
import {
  getNameRoleAccounts as ensjs_getNameRoleAccounts,
  getResource as ensjs_getResource,
} from '@ensdomains/ensjs/public/v2'
import { gql } from '@urql/core'
import { fromPromise, ok } from 'neverthrow'
import type { Address, Hex } from 'viem'
import { getAddress, zeroAddress } from 'viem'
import { namehash } from 'viem/ens'
import { graphqlIndexerClient } from '@/lib/indexer'
import { decodeRoleBitmap } from '@/lib/roles/decodeRoleBitmap'
import { toResourceHex } from '@/lib/roles/toResourceHex'
import { safeGetClient } from '@/lib/wagmi/helpers'

class GetNameRolesAccountsIndexerError extends TaggedError(
  'GetNameRolesAccountsIndexerError',
)<{
  cause: GraphqlRequestError
}> {}

class GetNameRolesAccountsError extends TaggedError(
  'GetNameRolesAccountsError',
)<{
  cause: GetNameRolesAccountsErrorType
}> {}

class GetResourceError extends TaggedError('GetResourceError')<{
  cause: GetResourceErrorType
}> {}

type IndexerEACEvent = {
  data: string
}

type EACRolesChangedPayload = {
  resource: string
  account: string
  oldRoleBitmap: string
  newRoleBitmap: string
}

const MAX_EVENTS = 1000

/**
 * Read current `(account → roles[])` state for `resource` on `registryAddress`
 * from the indexer by replaying `EACRolesChanged` events.
 *
 * We can't use the indexer's top-level `roles(resource:)` field because it
 * isn't scoped by registry — `ROOT_RESOURCE` (`0x0`) is shared across every
 * sub-registry, so a resource-only filter would conflate role grants across
 * unrelated registries. The `events(contractAddress:)` filter is registry-
 * scoped, so we use that and reconstruct state client-side.
 *
 * Scoped by `namehash` as well as registry: the `.eth` registry emits one of
 * these per registration, so a registry-only window reached back about three
 * days and every older name read as having no role holders.
 */
const getNameRolesAccountsFromIndexer = async (
  registryAddress: Address,
  node: Hex,
  resource: string,
): Promise<GetNameRolesAccountsReturnType> => {
  const { events } = await graphqlIndexerClient.request<{
    events: IndexerEACEvent[]
  }>(
    gql`
      query getEACRolesChangedForName(
        $contractAddress: String!
        $namehash: String!
        $first: Int!
      ) {
        events(
          where: {
            type: "EACRolesChanged"
            contractAddress: $contractAddress
            namehash: $namehash
          }
          first: $first
          orderBy: blockNumber
          orderDirection: desc
        ) {
          data
        }
      }
    `,
    {
      contractAddress: registryAddress.toLowerCase(),
      namehash: node,
      first: MAX_EVENTS,
    },
  )

  const result: GetNameRolesAccountsReturnType = new Map()
  // Walk events newest → oldest. The first event we see for a given account
  // is the latest one, and `newRoleBitmap` is the absolute role state at
  // that point, so we can stop tracking that account afterwards.
  const seen = new Set<Address>()

  for (const event of events) {
    const data = JSON.parse(event.data) as EACRolesChangedPayload
    if (data.resource.toLowerCase() !== resource.toLowerCase()) continue

    const account = getAddress(data.account)
    if (account === zeroAddress) continue
    if (seen.has(account)) continue
    seen.add(account)

    const decoded = decodeRoleBitmap(data.newRoleBitmap)
    if (decoded.length > 0) result.set(account, decoded)
  }

  return result
}

type NameRolesAccountsParameters = GetNameRolesAccountsParameters & {
  /** The full name. `label` alone cannot address the event query's filter. */
  readonly name: string
}

const getNameRolesAccounts = ResultFn(async function* ({
  name,
  ...params
}: NameRolesAccountsParameters) {
  const client = yield* safeGetClient()

  // Read the on-chain `resource` for this label from the actual registry so
  // the indexer lookup works at any name depth, not just labels held in the
  // v2 ETHRegistry where `resource === labelToCanonicalId(label)`.
  const resource = yield* fromPromise(
    ensjs_getResource(client, {
      label: params.label,
      registryAddress: params.registryAddress,
    }),
    (e) => new GetResourceError({ cause: e as GetResourceErrorType }),
  )

  const indexerResult = await fromPromise(
    getNameRolesAccountsFromIndexer(
      params.registryAddress,
      namehash(name),
      toResourceHex(resource),
    ),
    (e) =>
      new GetNameRolesAccountsIndexerError({ cause: e as GraphqlRequestError }),
  )

  if (indexerResult.isOk()) return ok(indexerResult.value)

  // Indexer GraphQL call failed — fall back to an on-chain log scan.
  const result = yield* fromPromise(
    ensjs_getNameRoleAccounts(client, params),
    (e) =>
      new GetNameRolesAccountsError({
        cause: e as GetNameRolesAccountsErrorType,
      }),
  )

  return ok(result)
})

const getNameRolesAccountsQueryKey = createQueryKey<
  'get-name-roles-accounts',
  NameRolesAccountsParameters
>('get-name-roles-accounts')

export const getNameRolesAccountsQueryOptions = (
  params: NameRolesAccountsParameters,
) =>
  resultQueryOptions({
    queryKey: getNameRolesAccountsQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getNameRolesAccounts(params),
  })
