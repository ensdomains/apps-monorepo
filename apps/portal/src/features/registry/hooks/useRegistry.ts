import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { registryGetSubregistrySnippet } from '@ensdomains/ensjs-abi/registry'
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
    labels: Array<{
      name: string | null
      labelName: string | null
      labelhash: string | null
    }>
  } | null
}

const referencedByQueryKey = createQueryKey<
  'registry-referenced-by',
  { address: Address }
>('registry-referenced-by')

// One label batch per emitter registry. The indexer has no labelhash filter,
// so we cap the fetch rather than paginate — acceptable for current registry
// sizes; revisit with pagination if a registry exceeds this.
const LABEL_LIMIT = 1000

type RegistryPublicClient = NonNullable<ReturnType<typeof usePublicClient>>

/**
 * Resolves the names whose current subregistry points at `address`.
 *
 * Strategy:
 *   1. `getLogs` filtered server-side on the `subregistry` topic — every
 *      (emitter, tokenId) that ever had this address set as their subregistry.
 *      Scan from genesis: a name can be pointed at a CREATE2 address BEFORE the
 *      registry contract is deployed there, so bounding by the registry's own
 *      `createdBlock` would miss those pre-deployment events. The indexed-topic
 *      filter keeps the RPC cost bounded regardless of range.
 *   2. Resolve candidate tokenIds to (emitter, label, name) via the indexer by
 *      matching `tokenId >> 32` against `Domain.labelhash >> 32` under the
 *      emitter registry (see LibLabel.withVersion). The indexer has no labelhash
 *      filter, so we fetch a single capped batch of labels per emitter.
 *   3. Authoritative current-state check: one `multicall` of
 *      `getSubregistry(label)` per candidate — keep only those whose live
 *      onchain subregistry still equals this address. This replaces a
 *      log-replay/dedupe step with a direct contract read.
 *
 * Returns a plain Promise (rather than a neverthrow Result) because TanStack
 * Query consumes the thrown rejection directly; the hook below is the only
 * caller. See memory: project-registry-dashboard-data.
 */
const getRegistryReferencedBy = async (
  publicClient: RegistryPublicClient,
  address: Address,
): Promise<ReferencingName[]> => {
  // 1. Every (emitter, tokenId) ever set to this address.
  const logs = await publicClient.getLogs({
    event: subregistryUpdatedEvent,
    args: { subregistry: address },
    fromBlock: 0n,
    toBlock: 'latest',
  })

  // Group candidate tokenIds by emitter for per-registry label lookups.
  const candidatesByEmitter = new Map<Address, Set<string>>()
  for (const log of logs) {
    if (log.args.tokenId === undefined) continue
    const emitter = log.address as Address
    const set = candidatesByEmitter.get(emitter) ?? new Set<string>()
    set.add(log.args.tokenId.toString())
    candidatesByEmitter.set(emitter, set)
  }
  if (candidatesByEmitter.size === 0) return []

  // 2. Resolve candidate tokenIds to (emitter, label, full name) via the
  // indexer.
  type Candidate = { emitter: Address; label: string; name: string }
  const candidates: Candidate[] = []
  await Promise.all(
    Array.from(candidatesByEmitter.entries()).map(
      async ([emitter, tokenIdStrings]) => {
        const wantedCanonical = new Set(
          Array.from(tokenIdStrings).map((s) =>
            canonicalLabelBits(BigInt(s)).toString(),
          ),
        )
        const found = new Set<string>()
        const data = await graphqlIndexerClient.request<RegistryLabelsResponse>(
          gql`
            query registryLabelsForReferencedBy(
              $address: String!
              $first: Int!
            ) {
              registry(address: $address) {
                labels(first: $first) {
                  name
                  labelName
                  labelhash
                }
              }
            }
          `,
          {
            address: emitter.toLowerCase(),
            first: LABEL_LIMIT,
          },
        )
        const labels = data.registry?.labels ?? []
        for (const label of labels) {
          if (!label.name || !label.labelName || !label.labelhash) continue
          const labelCanonical = canonicalLabelBits(
            BigInt(label.labelhash),
          ).toString()
          if (
            wantedCanonical.has(labelCanonical) &&
            !found.has(labelCanonical)
          ) {
            candidates.push({
              emitter,
              label: label.labelName,
              name: label.name,
            })
            found.add(labelCanonical)
          }
        }
      },
    ),
  )

  if (candidates.length === 0) return []

  // 3. Authoritative current-state check via multicall — one RPC for the whole
  // batch. Tokens whose final subregistry has moved away from `address` are
  // dropped here.
  const current = await publicClient.multicall({
    contracts: candidates.map((c) => ({
      address: c.emitter,
      abi: registryGetSubregistrySnippet,
      functionName: 'getSubregistry' as const,
      args: [c.label],
    })),
  })

  return candidates
    .filter(
      (_, i) =>
        current[i].status === 'success' &&
        isAddressEqual(current[i].result as Address, address),
    )
    .map(({ emitter, name }) => ({ emitter, name }))
}

/**
 * Query hook for {@link getRegistryReferencedBy} — wires in the wagmi public
 * client and TanStack Query; all fetch logic lives in the helper above.
 */
export const useRegistryReferencedBy = (
  registry: Pick<Registry, 'address'> | undefined,
) => {
  const publicClient = usePublicClient()
  return useQuery({
    queryKey: referencedByQueryKey({
      address: registry?.address ?? zeroAddress,
    }),
    enabled: !!publicClient && !!registry,
    queryFn: () =>
      publicClient && registry
        ? getRegistryReferencedBy(publicClient, registry.address)
        : Promise.resolve([]),
  })
}
