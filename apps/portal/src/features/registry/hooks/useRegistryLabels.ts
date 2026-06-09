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

type IndexerLabel = {
  name: string | null
  labelName: string | null
  labelhash: string | null
  tokenId: string | null
  expiryDate: number | null
  /** Distinct label-scoped role holders, counted by the indexer. */
  roleHolderCount: number | null
}

const LABELS_LIMIT = 100

const toLabelRows = (labels: IndexerLabel[]): RegistryLabelRow[] => {
  const rows: RegistryLabelRow[] = []
  for (const label of labels) {
    if (!label.labelhash) continue
    rows.push({
      name: label.name,
      labelName: label.labelName,
      labelhash: label.labelhash,
      expiryDate: label.expiryDate,
      roleHoldersCount: label.roleHolderCount ?? 0,
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
        labels: IndexerLabel[]
      } | null
    }>(
      gql`
        query getRegistryLabels($address: String!) {
          registry(address: $address) {
            labels(first: ${LABELS_LIMIT}, orderBy: name, orderDirection: asc) {
              name
              labelName
              labelhash
              tokenId
              expiryDate
              roleHolderCount
            }
          }
        }
      `,
      { address: address.toLowerCase() },
    ),
    (e) => new GetRegistryLabelsError({ cause: e as ClientError }),
  )

  if (!registry) return ok([])

  return ok(toLabelRows(registry.labels))
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
