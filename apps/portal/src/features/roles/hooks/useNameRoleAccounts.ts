import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import type {
  GetNameRolesAccountsErrorType,
  GetNameRolesAccountsParameters,
  GetNameRolesAccountsReturnType,
} from '@ensdomains/ensjs/public/v2'
import { getNameRoleAccounts as ensjs_getNameRoleAccounts } from '@ensdomains/ensjs/public/v2'
import { labelToCanonicalId } from '@ensdomains/ensjs/utils/v2'
import { type ClientError, gql } from 'graphql-request'
import { fromPromise, ok, ResultAsync } from 'neverthrow'
import type { Address } from 'viem'
import { getAddress, zeroAddress } from 'viem'
import { graphqlIndexerClient } from '@/lib/indexer'
import { decodeRoleBitmap } from '@/lib/roles/decodeRoleBitmap'
import { toResourceHex } from '@/lib/roles/toResourceHex'
import { safeGetClient } from '@/lib/wagmi/helpers'

class GetNameRolesAccountsIndexerError extends TaggedError(
  'GetNameRolesAccountsIndexerError',
)<{
  cause: ClientError
}> {}

class GetNameRolesAccountsError extends TaggedError(
  'GetNameRolesAccountsError',
)<{
  cause: GetNameRolesAccountsErrorType
}> {}

type IndexerRoleAssignment = {
  account: string
  roleBitmap: string
}

const getNameRolesAccountsFromIndexer = async ({
  label,
}: GetNameRolesAccountsParameters): Promise<GetNameRolesAccountsReturnType> => {
  // This indexer accepts the v2 ETHRegistry tokenId-form resource for role lookups.
  const resource = toResourceHex(labelToCanonicalId(label))

  const { roles } = await graphqlIndexerClient.request<{
    roles: IndexerRoleAssignment[]
  }>(
    gql`
      query getRolesForResource($resource: String!) {
        roles(resource: $resource) {
          account
          roleBitmap
        }
      }
    `,
    { resource },
  )

  const result = new Map<Address, string[]>()

  for (const role of roles) {
    const account = getAddress(role.account)
    if (account === zeroAddress) continue

    result.set(account, decodeRoleBitmap(role.roleBitmap))
  }

  return result as GetNameRolesAccountsReturnType
}

const getNameRolesAccounts = ResultFn(async function* (
  params: GetNameRolesAccountsParameters,
) {
  const indexerResult = await ResultAsync.fromPromise(
    getNameRolesAccountsFromIndexer(params),
    (e) => new GetNameRolesAccountsIndexerError({ cause: e as ClientError }),
  )

  if (indexerResult.isOk()) {
    return ok(indexerResult.value)
  }

  // Fallback to ensjs when indexer fails
  const client = yield* safeGetClient()

  const result = yield* fromPromise(
    ensjs_getNameRoleAccounts(client, params),
    (e) =>
      new GetNameRolesAccountsError({
        cause: e as GetNameRolesAccountsErrorType,
      }),
  )

  return ok(result as GetNameRolesAccountsReturnType)
})

const getNameRolesAccountsQueryKey = createQueryKey<
  'get-name-roles-accounts',
  GetNameRolesAccountsParameters
>('get-name-roles-accounts')

export const getNameRolesAccountsQueryOptions = (
  params: GetNameRolesAccountsParameters,
) =>
  resultQueryOptions({
    queryKey: getNameRolesAccountsQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getNameRolesAccounts(params),
  })
