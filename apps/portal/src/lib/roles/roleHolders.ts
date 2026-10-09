import { fromSync, ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { gql } from '@urql/core'
import { fromPromise, ok } from 'neverthrow'
import { type Address, getAddress } from 'viem'
import {
  asBigInt,
  asHex,
  asRecord,
  requestIndexedRoles,
} from '@/lib/roles/indexedRoles'
import { toResourceHex } from '@/lib/roles/toResourceHex'

class GetRoleHoldersError extends TaggedError('GetRoleHoldersError')<{
  reason: 'failed' | 'timeout' | 'truncated'
  cause: unknown
}> {}

/** More holders than this on one resource fails the read rather than drop any. */
const ROLE_HOLDERS_LIMIT = 1000

const toRoleHolder = (raw: unknown) => {
  const row = asRecord(raw, 'row')
  return {
    account: getAddress(asHex(row.account, 'account')),
    roleBitmap: BigInt(asHex(row.roleBitmap, 'roleBitmap')),
    id: asBigInt(row.id, 'id'),
  }
}

/** Each account's current role bitmap on one resource of one registry, first granted first. */
export const getRoleHolders = ResultFn(async function* ({
  registryAddress,
  resource,
}: {
  readonly registryAddress: Address
  readonly resource: bigint
}) {
  const page = yield* fromPromise(
    requestIndexedRoles<{
      readonly roleConnection?: {
        readonly pageInfo: { readonly hasNextPage: boolean }
        readonly edges: readonly { readonly node: unknown }[]
      }
    }>(
      gql`
        query RoleHolders($contract: String!, $resource: String!, $first: Int!) {
          roleConnection(
            contract: $contract
            resource: $resource
            first: $first
          ) {
            pageInfo {
              hasNextPage
            }
            edges {
              node {
                id
                account
                roleBitmap
              }
            }
          }
        }
      `,
      {
        contract: registryAddress.toLowerCase(),
        resource: toResourceHex(resource),
        first: ROLE_HOLDERS_LIMIT,
      },
    ),
    (cause) => new GetRoleHoldersError({ reason: 'failed', cause }),
  )
  if (page === null) {
    return yield* new GetRoleHoldersError({
      reason: 'timeout',
      cause: undefined,
    }).toErr()
  }
  if (!page.roleConnection) {
    return yield* new GetRoleHoldersError({
      reason: 'failed',
      cause: page,
    }).toErr()
  }
  if (page.roleConnection.pageInfo.hasNextPage) {
    return yield* new GetRoleHoldersError({
      reason: 'truncated',
      cause: undefined,
    }).toErr()
  }

  const { edges } = page.roleConnection
  const holders = yield* fromSync(
    () =>
      edges
        .map(({ node }) => toRoleHolder(node))
        // Ids count up as assignments are first created, so this is first-grant
        // order. `blockNumber` is the latest change and would move an edited
        // holder to the end.
        .toSorted((a, b) => Number(a.id - b.id)),
    (cause) => new GetRoleHoldersError({ reason: 'failed', cause }),
  )

  return ok(holders)
})
