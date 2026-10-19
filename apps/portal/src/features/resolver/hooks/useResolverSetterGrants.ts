import { fromSync, ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { gql } from '@urql/core'
import { fromPromise, ok } from 'neverthrow'
import type { Address } from 'viem'
import { asHex, asRecord, requestIndexedRoles } from '@/lib/roles/indexedRoles'
import {
  decodeSetterGrants,
  type ResourceArgumentLabel,
} from '@/lib/roles/resolverRoles'

class GetResolverSetterGrantsError extends TaggedError(
  'GetResolverSetterGrantsError',
)<{
  readonly reason: 'failed' | 'timeout'
  readonly cause: unknown
}> {}

type GetResolverSetterGrantsParameters = {
  readonly resolverAddress: Address
  readonly account: Address
}

const getResolverSetterGrants = ResultFn(async function* ({
  resolverAddress,
  account,
}: GetResolverSetterGrantsParameters) {
  const data = yield* fromPromise(
    requestIndexedRoles<{
      readonly roles: readonly unknown[]
      readonly resolver: {
        readonly namedResources: readonly ResourceArgumentLabel[] | null
      } | null
    }>(
      gql`
        query ResolverSetterGrants($account: String!, $contract: String!) {
          roles(account: $account, contract: $contract) {
            resource
            roleBitmap
          }
          resolver(id: $contract) {
            namedResources {
              resource
              recordKind
              recordKey
              coinType
            }
          }
        }
      `,
      {
        account: account.toLowerCase(),
        contract: resolverAddress.toLowerCase(),
      },
    ),
    (cause) => new GetResolverSetterGrantsError({ reason: 'failed', cause }),
  )
  if (data === null) {
    return yield* new GetResolverSetterGrantsError({
      reason: 'timeout',
      cause: undefined,
    }).toErr()
  }

  const scopes = yield* fromSync(
    () =>
      decodeSetterGrants(
        data.roles.map((raw) => {
          const row = asRecord(raw, 'row')
          return {
            resource: BigInt(asHex(row.resource, 'resource')),
            roleBitmap: BigInt(asHex(row.roleBitmap, 'roleBitmap')),
          }
        }),
        data.resolver?.namedResources ?? [],
      ),
    (cause) => new GetResolverSetterGrantsError({ reason: 'failed', cause }),
  )

  return ok(scopes)
})

const getResolverSetterGrantsQueryKey = createQueryKey<
  'get-resolver-setter-grants',
  GetResolverSetterGrantsParameters
>('get-resolver-setter-grants')

/** The setter scopes `account` is granted on `resolverAddress`, per the indexer. */
export const getResolverSetterGrantsQueryOptions = (
  params: GetResolverSetterGrantsParameters,
) =>
  resultQueryOptions({
    queryKey: getResolverSetterGrantsQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getResolverSetterGrants(params),
  })
