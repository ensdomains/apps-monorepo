import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { useQuery } from '@tanstack/react-query'
import { type ClientError, gql } from 'graphql-request'
import { fromPromise, ok } from 'neverthrow'
import { type Address, isAddressEqual, parseAbiItem, zeroAddress } from 'viem'
import { usePublicClient } from 'wagmi'
import { graphqlIndexerClient } from '@/lib/indexer'

class GetRegistryError extends TaggedError('GetRegistryError')<{
  cause: ClientError
}> {}

type GetRegistryParameters = {
  address: Address
}

export type Registry = {
  address: Address
  /** This registry's own ENS name (e.g. "eth"); empty for the root. */
  name: string
  namehash: string
  /** Address of the parent registry (zero address for the root). */
  parentRegistry: Address
  createdBlock: number
  createdAt: number
  labelCount: number
  roleCount: number
  eventCount: number
}

const getRegistry = ResultFn(async function* ({
  address,
}: GetRegistryParameters) {
  const { registry } = yield* fromPromise(
    graphqlIndexerClient.request<{ registry: Registry | null }>(
      gql`
        query getRegistry($address: String!) {
          registry(address: $address) {
            address
            name
            namehash
            parentRegistry
            createdBlock
            createdAt
            labelCount
            roleCount
            eventCount
          }
        }
      `,
      { address: address.toLowerCase() },
    ),
    (e) => new GetRegistryError({ cause: e as ClientError }),
  )

  // null = indexer has no record for this address (not a registry, or not yet
  // indexed). Distinct from a registry with zero labels/roles.
  return ok(registry)
})

const getRegistryQueryKey = createQueryKey<
  'get-registry',
  GetRegistryParameters
>('get-registry')

export const getRegistryQueryOptions = (params: GetRegistryParameters) =>
  resultQueryOptions({
    queryKey: getRegistryQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getRegistry(params),
  })

// `subregistry` is an indexed event topic in IRegistryEvents.sol, so RPCs can
// filter logs on it — that's how we do the reverse lookup despite the
// indexer's `EventFilter` not exposing inner event fields.
const subregistryUpdatedEvent = parseAbiItem(
  'event SubregistryUpdated(uint256 indexed tokenId, address indexed subregistry, address indexed sender)',
)

// LibLabel.withVersion (LibLabel.sol) replaces the lower 32 bits of the
// labelhash with the token's versionId to form `tokenId`. So the upper 224
// bits of a tokenId equal the upper 224 bits of its labelhash, and
// matching on `tokenId >> 32 === labelhash >> 32` is collision-safe in
// practice (2^-224).
const canonicalLabelBits = (id: bigint) => id >> 32n

export type ReferencingName = {
  /** The full ENS name (e.g. "alice.eth") of the parent label pointing here. */
  name: string
  /** The parent registry contract that emitted the SubregistryUpdated event. */
  emitter: Address
}

type RegistryLabelsResponse = {
  registry: {
    labels: Array<{ name: string | null; labelhash: string | null }>
  } | null
}

const referencedByQueryKey = createQueryKey<
  'registry-referenced-by',
  { address: Address }
>('registry-referenced-by')

/**
 * Names whose current subregistry points at the given registry contract.
 *
 * The indexer has no reverse-lookup field yet, but `SubregistryUpdated` emits
 * `subregistry` as an indexed topic so RPCs can filter logs on it directly.
 * Strategy:
 *   1. `getLogs` filtered on the `subregistry` topic, scoped to blocks at or
 *      after this registry's `createdBlock` — every (parent, tokenId) that
 *      ever had this address set as their subregistry. Bounding by
 *      `createdBlock` keeps the scan small and avoids provider range limits.
 *   2. For each candidate emitter, one `getLogs` for ALL `SubregistryUpdated`
 *      events on the candidate tokenIds (since `createdBlock`). Dedupe to
 *      the latest event per tokenId by (blockNumber, logIndex) and keep
 *      only those whose final `subregistry` is still this address —
 *      collapses the per-candidate verification into a single per-emitter
 *      call.
 *   3. Resolve each surviving (emitter, tokenId) to its child name by
 *      matching `tokenId >> 32` against the indexer's `Domain.labelhash >> 32`
 *      under the emitter registry (see LibLabel.withVersion).
 *
 * See memory: project-registry-dashboard-data.
 */
export const useRegistryReferencedBy = (
  registry: Pick<Registry, 'address' | 'createdBlock'> | undefined,
) => {
  const publicClient = usePublicClient()
  return useQuery({
    queryKey: referencedByQueryKey({
      address: registry?.address ?? zeroAddress,
    }),
    enabled: !!publicClient && !!registry,
    queryFn: async (): Promise<ReferencingName[]> => {
      if (!publicClient || !registry) return []
      const { address, createdBlock } = registry
      const fromBlock = BigInt(createdBlock)

      // 1. Every (emitter, tokenId) ever set to this address.
      const logs = await publicClient.getLogs({
        event: subregistryUpdatedEvent,
        args: { subregistry: address },
        fromBlock,
        toBlock: 'latest',
      })

      // Group candidate tokenIds by emitter — only emitters that ever
      // referenced this registry need to be re-queried in step 2.
      const candidatesByEmitter = new Map<Address, Set<string>>()
      for (const log of logs) {
        if (log.args.tokenId === undefined) continue
        const emitter = log.address as Address
        const set = candidatesByEmitter.get(emitter) ?? new Set<string>()
        set.add(log.args.tokenId.toString())
        candidatesByEmitter.set(emitter, set)
      }
      if (candidatesByEmitter.size === 0) return []

      // 2. One getLogs per emitter for our candidate tokenIds. Dedupe to
      // latest per tokenId and keep only those whose final subregistry is
      // still `address`.
      const verifiedByEmitter = new Map<Address, bigint[]>()
      await Promise.all(
        Array.from(candidatesByEmitter.entries()).map(
          async ([emitter, tokenIdStrings]) => {
            const tokenIds = Array.from(tokenIdStrings).map((s) => BigInt(s))
            const allLogs = await publicClient.getLogs({
              address: emitter,
              event: subregistryUpdatedEvent,
              args: { tokenId: tokenIds },
              fromBlock,
              toBlock: 'latest',
            })
            type Latest = {
              tokenId: bigint
              subregistry: Address
              blockNumber: bigint
              logIndex: number
            }
            const latest = new Map<string, Latest>()
            for (const log of allLogs) {
              if (
                log.args.tokenId === undefined ||
                log.args.subregistry === undefined
              )
                continue
              const next: Latest = {
                tokenId: log.args.tokenId,
                subregistry: log.args.subregistry as Address,
                blockNumber: log.blockNumber,
                logIndex: log.logIndex,
              }
              const key = next.tokenId.toString()
              const existing = latest.get(key)
              if (
                !existing ||
                next.blockNumber > existing.blockNumber ||
                (next.blockNumber === existing.blockNumber &&
                  next.logIndex > existing.logIndex)
              ) {
                latest.set(key, next)
              }
            }
            const kept: bigint[] = []
            for (const v of latest.values()) {
              if (isAddressEqual(v.subregistry, address)) kept.push(v.tokenId)
            }
            if (kept.length > 0) verifiedByEmitter.set(emitter, kept)
          },
        ),
      )

      if (verifiedByEmitter.size === 0) return []

      const byEmitter = verifiedByEmitter

      const results: ReferencingName[] = []
      await Promise.all(
        Array.from(byEmitter.entries()).map(async ([emitter, tokenIds]) => {
          const wantedCanonical = new Set(
            tokenIds.map((t) => canonicalLabelBits(t).toString()),
          )
          const found = new Set<string>()
          // Paginate: the indexer has no labelhash filter, so we walk pages
          // until every wanted canonical-bit prefix is matched or the
          // registry is exhausted. Hard cap prevents runaway on huge
          // registries where a candidate truly has no surviving label.
          const PAGE = 1000
          const MAX_PAGES = 20
          for (let page = 0; page < MAX_PAGES; page++) {
            const data =
              await graphqlIndexerClient.request<RegistryLabelsResponse>(
                gql`
                  query registryLabelsForReferencedBy(
                    $address: String!
                    $first: Int!
                    $skip: Int!
                  ) {
                    registry(address: $address) {
                      labels(first: $first, skip: $skip) {
                        name
                        labelhash
                      }
                    }
                  }
                `,
                {
                  address: emitter.toLowerCase(),
                  first: PAGE,
                  skip: page * PAGE,
                },
              )
            const labels = data.registry?.labels ?? []
            for (const label of labels) {
              if (!label.name || !label.labelhash) continue
              const labelCanonical = canonicalLabelBits(
                BigInt(label.labelhash),
              ).toString()
              if (wantedCanonical.has(labelCanonical)) {
                results.push({ name: label.name, emitter })
                found.add(labelCanonical)
              }
            }
            if (labels.length < PAGE) break
            if (found.size === wantedCanonical.size) break
          }
        }),
      )
      return results
    },
  })
}
