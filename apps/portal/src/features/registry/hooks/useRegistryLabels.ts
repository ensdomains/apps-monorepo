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

// A label's on-chain `resource` is its canonical token id — the labelhash with
// the lower 32 version bits cleared (LibLabel.withVersion). Shifting both the
// role `resource` and the `labelhash` right by 32 normalizes away the version,
// so a label matches its role assignments regardless of version bumps.
const canonicalBits = (hex: string) => BigInt(hex) >> 32n
const ROOT_RESOURCE_CANONICAL = 0n

// Labels and roles are capped per request. Registries with more than this need
// pagination, which the table doesn't expose yet.
const LABELS_PAGE_SIZE = 100
const ROLES_PAGE_SIZE = 1000

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
  const { registry } = yield* fromPromise(
    graphqlIndexerClient.request<{
      registry: {
        roles: IndexerRole[]
        labels: IndexerLabel[]
      } | null
    }>(
      gql`
        query getRegistryLabels(
          $address: String!
          $first: Int!
          $rolesFirst: Int!
        ) {
          registry(address: $address) {
            roles(first: $rolesFirst) {
              account
              resource
              roleBitmap
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
        address: address.toLowerCase(),
        first: LABELS_PAGE_SIZE,
        rolesFirst: ROLES_PAGE_SIZE,
      },
    ),
    (e) => new GetRegistryLabelsError({ cause: e as ClientError }),
  )

  // null = indexer has no record for this address (not a registry, or not yet
  // indexed). The route already surfaces not-found via useRegistry, so an empty
  // list is the right shape here.
  if (!registry) return ok([])

  return ok(toLabelRows(registry.labels, registry.roles))
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
