import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { type ClientError, gql } from 'graphql-request'
import { fromPromise, ok } from 'neverthrow'
import type { Address } from 'viem'
import { graphqlIndexerClient } from '@/lib/indexer'

class GetRegistryLabelsError extends TaggedError('GetRegistryLabelsError')<{
  cause: ClientError
}> {}

type GetRegistryLabelsParameters = {
  address: Address
}

export type RegistryLabelRow = {
  /** Full ENS name (e.g. "lmao.chakri.eth"); null if the label isn't reachable. */
  name: string | null
  /** The label segment (e.g. "lmao"); null when unnormalized. */
  labelName: string | null
  labelhash: string
  /** Unix seconds; null/0 means the label does not expire. */
  expiryDate: number | null
  /** Distinct accounts holding any label-scoped role on this label. */
  roleHoldersCount: number
}

type IndexerRole = {
  account: string
  resource: string
  roleBitmap: string
}

type IndexerLabel = {
  name: string | null
  labelName: string | null
  labelhash: string | null
  tokenId: string | null
  expiryDate: number | null
}

type RolePage = {
  pageInfo: { hasNextPage: boolean; endCursor: string | null }
  edges: { node: IndexerRole }[]
}

// A label's on-chain `resource` is its canonical token id — the labelhash with
// the lower 32 version bits cleared (LibLabel.withVersion). Shifting both the
// role `resource` and the `labelhash` right by 32 normalizes away the version,
// so a label matches its role assignments regardless of version bumps.
const canonicalBits = (hex: string) => BigInt(hex) >> 32n
const ROOT_RESOURCE_CANONICAL = 0n

// Labels are returned as a single page — the table doesn't paginate them yet,
// matching the other registry tables. Roles, in contrast, are fully paginated
// below so roleHoldersCount is exact for a registry of any size.
const LABELS_PAGE_SIZE = 100
const ROLES_PAGE_SIZE = 1000
// Safety bound so a misbehaving indexer can't loop forever (mirrors useRoleHistory).
const MAX_ROLE_PAGES = 50

// This indexer ignores GraphQL *variables* on connection args (roleConnection
// first/after) and only honors inline literals, so we build the role query with
// the cursor inlined. Cursors are opaque base64 tokens; refuse anything that
// isn't one rather than splice unexpected text into the query string.
const isCursorToken = (value: string) => /^[A-Za-z0-9+/=]+$/.test(value)

const buildRolesPageQuery = (afterCursor: string | null) => gql`
  query getRegistryRoles($address: String!) {
    registry(address: $address) {
      roleConnection(first: ${ROLES_PAGE_SIZE}${
        afterCursor ? `, after: "${afterCursor}"` : ''
      }) {
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          node {
            account
            resource
            roleBitmap
          }
        }
      }
    }
  }
`

/**
 * Count distinct accounts holding any label-scoped role, keyed by the canonical
 * resource bits. Roles on `ROOT_RESOURCE` (registry-wide admin) and empty
 * bitmaps are excluded — they aren't tied to an individual label.
 */
const countHoldersByResource = (
  roles: IndexerRole[],
): Map<string, Set<string>> => {
  const holdersByResource = new Map<string, Set<string>>()
  for (const role of roles) {
    if (BigInt(role.roleBitmap) === 0n) continue
    const canonical = canonicalBits(role.resource)
    if (canonical === ROOT_RESOURCE_CANONICAL) continue
    const key = canonical.toString()
    const holders = holdersByResource.get(key) ?? new Set<string>()
    holders.add(role.account.toLowerCase())
    holdersByResource.set(key, holders)
  }
  return holdersByResource
}

const toLabelRows = (
  labels: IndexerLabel[],
  roles: IndexerRole[],
): RegistryLabelRow[] => {
  const holdersByResource = countHoldersByResource(roles)
  const rows: RegistryLabelRow[] = []
  for (const label of labels) {
    if (!label.labelhash) continue
    const key = canonicalBits(label.labelhash).toString()
    rows.push({
      name: label.name,
      labelName: label.labelName,
      labelhash: label.labelhash,
      expiryDate: label.expiryDate,
      roleHoldersCount: holdersByResource.get(key)?.size ?? 0,
    })
  }
  return rows
}

const getRegistryLabels = ResultFn(async function* ({
  address,
}: GetRegistryLabelsParameters) {
  const registryAddress = address.toLowerCase()

  // Labels + the first page of role assignments. roleConnection's `first` is
  // inlined (variables are ignored on it — see isCursorToken note); the labels
  // offset list honors variables fine.
  const { registry } = yield* fromPromise(
    graphqlIndexerClient.request<{
      registry: {
        roleConnection: RolePage
        labels: IndexerLabel[]
      } | null
    }>(
      gql`
        query getRegistryLabels($address: String!, $first: Int!) {
          registry(address: $address) {
            roleConnection(first: ${ROLES_PAGE_SIZE}) {
              pageInfo {
                hasNextPage
                endCursor
              }
              edges {
                node {
                  account
                  resource
                  roleBitmap
                }
              }
            }
            labels(first: $first, orderBy: name, orderDirection: asc) {
              name
              labelName
              labelhash
              tokenId
              expiryDate
            }
          }
        }
      `,
      {
        address: registryAddress,
        first: LABELS_PAGE_SIZE,
      },
    ),
    (e) => new GetRegistryLabelsError({ cause: e as ClientError }),
  )

  // null = indexer has no record for this address (not a registry, or not yet
  // indexed). The route already surfaces not-found via useRegistry, so an empty
  // list is the right shape here.
  if (!registry) return ok([])

  // Follow the role cursor to load every assignment — roleHoldersCount must be
  // exact, not a sample. The roles relation caps at one page and its `skip` arg
  // is broken on this indexer, so the inlined cursor is the only way through.
  const roles: IndexerRole[] = registry.roleConnection.edges.map((e) => e.node)
  let { hasNextPage, endCursor } = registry.roleConnection.pageInfo

  for (
    let page = 1;
    hasNextPage &&
    endCursor &&
    isCursorToken(endCursor) &&
    page < MAX_ROLE_PAGES;
    page++
  ) {
    const { registry: rolePage } = yield* fromPromise(
      graphqlIndexerClient.request<{
        registry: { roleConnection: RolePage } | null
      }>(buildRolesPageQuery(endCursor), { address: registryAddress }),
      (e) => new GetRegistryLabelsError({ cause: e as ClientError }),
    )

    if (!rolePage) break
    for (const edge of rolePage.roleConnection.edges) roles.push(edge.node)
    hasNextPage = rolePage.roleConnection.pageInfo.hasNextPage
    endCursor = rolePage.roleConnection.pageInfo.endCursor
  }

  return ok(toLabelRows(registry.labels, roles))
})

const getRegistryLabelsQueryKey = createQueryKey<
  'get-registry-labels',
  GetRegistryLabelsParameters
>('get-registry-labels')

export const getRegistryLabelsQueryOptions = (
  params: GetRegistryLabelsParameters,
) =>
  resultQueryOptions({
    queryKey: getRegistryLabelsQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getRegistryLabels(params),
  })
