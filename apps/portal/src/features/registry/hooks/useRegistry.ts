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

export const useRegistry = (address: Address, enabled = true) =>
  useQuery({ ...getRegistryQueryOptions({ address }), enabled })

/**
 * Resolve the parent registry's name. `parentRegistry` only gives the parent's
 * address, so this is a dependent lookup. Disabled for the root (zero address).
 */
export const useParentRegistry = (parentRegistry: Address | undefined) =>
  useQuery({
    ...getRegistryQueryOptions({ address: parentRegistry ?? zeroAddress }),
    enabled: !!parentRegistry && !isAddressEqual(parentRegistry, zeroAddress),
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
 *   1. `getLogs` filtered on the `subregistry` topic — every (parent,
 *      tokenId) that ever had this address set as their subregistry.
 *   2. Keep only the latest event per (emitter, tokenId).
 *   3. Per candidate, check for any *later* `SubregistryUpdated` on the same
 *      (emitter, tokenId) — that would mean the reference has been
 *      overwritten to a different value, so drop it.
 *   4. Resolve each surviving (emitter, tokenId) to its child name by
 *      matching `tokenId >> 32` against the indexer's `Domain.labelhash >> 32`
 *      under the emitter registry (see LibLabel.withVersion).
 *
 * See memory: project-registry-dashboard-data.
 */
export const useRegistryReferencedBy = (address: Address) => {
  const publicClient = usePublicClient()
  return useQuery({
    queryKey: referencedByQueryKey({ address }),
    enabled: !!publicClient,
    queryFn: async (): Promise<ReferencingName[]> => {
      if (!publicClient) return []

      // 1. Every time this address was set as someone's subregistry.
      const logs = await publicClient.getLogs({
        event: subregistryUpdatedEvent,
        args: { subregistry: address },
        fromBlock: 0n,
        toBlock: 'latest',
      })

      // 2. Latest event per (emitter, tokenId).
      type Candidate = {
        emitter: Address
        tokenId: bigint
        blockNumber: bigint
      }
      const candidates = new Map<string, Candidate>()
      for (const log of logs) {
        if (log.args.tokenId === undefined) continue
        const key = `${log.address.toLowerCase()}-${log.args.tokenId}`
        const existing = candidates.get(key)
        if (!existing || log.blockNumber > existing.blockNumber) {
          candidates.set(key, {
            emitter: log.address as Address,
            tokenId: log.args.tokenId,
            blockNumber: log.blockNumber,
          })
        }
      }
      if (candidates.size === 0) return []

      // 3. Drop any candidate that has been overwritten since.
      const verified = (
        await Promise.all(
          Array.from(candidates.values()).map(async (c) => {
            const later = await publicClient.getLogs({
              address: c.emitter,
              event: subregistryUpdatedEvent,
              args: { tokenId: c.tokenId },
              fromBlock: c.blockNumber + 1n,
              toBlock: 'latest',
            })
            return later.length === 0 ? c : null
          }),
        )
      ).filter((c): c is Candidate => c !== null)

      if (verified.length === 0) return []

      // 4. Resolve names — group by emitter to minimize indexer round-trips.
      const byEmitter = new Map<Address, bigint[]>()
      for (const v of verified) {
        const list = byEmitter.get(v.emitter) ?? []
        list.push(v.tokenId)
        byEmitter.set(v.emitter, list)
      }

      const results: ReferencingName[] = []
      await Promise.all(
        Array.from(byEmitter.entries()).map(async ([emitter, tokenIds]) => {
          const data =
            await graphqlIndexerClient.request<RegistryLabelsResponse>(
              gql`
                query registryLabelsForReferencedBy($address: String!) {
                  registry(address: $address) {
                    labels(first: 1000) {
                      name
                      labelhash
                    }
                  }
                }
              `,
              { address: emitter.toLowerCase() },
            )
          const labels = data.registry?.labels ?? []
          const wantedCanonical = new Set(
            tokenIds.map((t) => canonicalLabelBits(t).toString()),
          )
          for (const label of labels) {
            if (!label.name || !label.labelhash) continue
            const labelCanonical = canonicalLabelBits(
              BigInt(label.labelhash),
            ).toString()
            if (wantedCanonical.has(labelCanonical)) {
              results.push({ name: label.name, emitter })
            }
          }
        }),
      )
      return results
    },
  })
}
