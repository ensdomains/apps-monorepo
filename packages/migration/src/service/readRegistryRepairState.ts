import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { eacRolesChangedEventSnippet } from '@ensdomains/ensjs-abi/v2/enhancedAccessControl'
import {
  permissionedRegistryGetExpirySnippet,
  permissionedRegistryGetResolverSnippet,
  permissionedRegistryGetResourceSnippet,
  permissionedRegistryGetSubregistrySnippet,
  permissionedRegistryGetTokenIdSnippet,
  permissionedRegistryRolesSnippet,
} from '@ensdomains/ensjs-abi/v2/permissionedRegistry'
import { labelRegisteredEventSnippet } from '@ensdomains/ensjs-abi/v2/userRegistry'
import { fromPromise, ok } from 'neverthrow'
import {
  type Address,
  labelhash,
  type PublicClient,
  parseAbi,
  zeroAddress,
} from 'viem'
import type {
  RegistryRepairName,
  RegistryRepairState,
  RoleGrant,
} from './registryRepair'

const ROOT_RESOURCE = 0n
const MIN_LOG_RANGE = 500n
const DEFAULT_LOG_RANGE = 50_000n

const ownerOfAbi = parseAbi([
  'function ownerOf(uint256 tokenId) view returns (address)',
])
const getParentAbi = parseAbi([
  'function getParent() view returns (address parent, string label)',
])
const EVENTS = [
  ...labelRegisteredEventSnippet,
  ...eacRolesChangedEventSnippet,
] as const

export class RegistryRepairReadError extends TaggedError(
  'RegistryRepairReadError',
)<{
  readonly cause: unknown
}> {}

type Candidates = {
  readonly labels: readonly string[]
  readonly accounts: readonly Address[]
}

/** Every label the registry registered and every account whose roles on it changed, between two blocks. */
const readCandidates = async (params: {
  readonly client: PublicClient
  readonly registry: Address
  readonly fromBlock: bigint
  readonly toBlock: bigint
  readonly maxRange: bigint
}): Promise<Candidates> => {
  const collect = async (
    from: bigint,
    range: bigint,
    found: Candidates,
  ): Promise<Candidates> => {
    if (from > params.toBlock) return found
    const to =
      from + range - 1n > params.toBlock ? params.toBlock : from + range - 1n
    const logs = await params.client
      .getLogs({
        address: params.registry,
        events: EVENTS,
        fromBlock: from,
        toBlock: to,
        strict: true,
      })
      .catch((cause: unknown) => {
        if (range <= MIN_LOG_RANGE) throw cause
        return null
      })
    if (logs === null) return collect(from, range / 2n, found)
    return collect(to + 1n, params.maxRange, {
      labels: [
        ...found.labels,
        ...logs.flatMap((log) =>
          log.eventName === 'LabelRegistered' ? [log.args.label] : [],
        ),
      ],
      accounts: [
        ...found.accounts,
        ...logs.flatMap((log) =>
          log.eventName === 'EACRolesChanged' ? [log.args.account] : [],
        ),
      ],
    })
  }
  const found = await collect(params.fromBlock, params.maxRange, {
    labels: [],
    accounts: [],
  })
  return {
    labels: [...new Set(found.labels)],
    accounts: [...new Set(found.accounts)],
  }
}

const grantsOf = (
  accounts: readonly Address[],
  bitmaps: readonly bigint[],
): readonly RoleGrant[] =>
  accounts
    .map((account, i) => ({ account, roleBitmap: bitmaps[i] ?? 0n }))
    .filter((grant) => grant.roleBitmap !== 0n)

const readError = (cause: unknown) => new RegistryRepairReadError({ cause })

/** What a copy of `registry` must reproduce, read at one block; names count while owned and unexpired at `now` (unix seconds). */
export const readRegistryRepairState = ResultFn(async function* (params: {
  readonly client: PublicClient
  readonly registry: Address
  readonly fromBlock: bigint
  readonly now: bigint
  readonly maxLogRange?: bigint
}) {
  const { client, registry, now } = params
  const blockNumber = yield* fromPromise(client.getBlockNumber(), readError)
  const { labels, accounts } = yield* fromPromise(
    readCandidates({
      client,
      registry,
      fromBlock: params.fromBlock,
      toBlock: blockNumber,
      maxRange: params.maxLogRange ?? DEFAULT_LOG_RANGE,
    }),
    readError,
  )
  const at = { blockNumber, allowFailure: false } as const

  const [parentRegistry, parentLabel] = yield* fromPromise(
    client.readContract({
      address: registry,
      abi: getParentAbi,
      functionName: 'getParent',
      blockNumber,
    }),
    readError,
  )
  const [parentTokenId, tokenIds, rootBitmaps] = yield* fromPromise(
    Promise.all([
      client.readContract({
        address: parentRegistry,
        abi: permissionedRegistryGetTokenIdSnippet,
        functionName: 'getTokenId',
        args: [BigInt(labelhash(parentLabel))],
        blockNumber,
      }),
      client.multicall({
        ...at,
        contracts: labels.map((label) => ({
          address: registry,
          abi: permissionedRegistryGetTokenIdSnippet,
          functionName: 'getTokenId',
          args: [BigInt(labelhash(label))],
        })),
      }),
      client.multicall({
        ...at,
        contracts: accounts.map((account) => ({
          address: registry,
          abi: permissionedRegistryRolesSnippet,
          functionName: 'roles',
          args: [ROOT_RESOURCE, account],
        })),
      }),
    ]),
    readError,
  )

  const [owners, resolvers, subregistries, expiries, resources] =
    yield* fromPromise(
      Promise.all([
        // An unregistered token has no owner and may revert; it counts as unowned.
        client.multicall({
          blockNumber,
          allowFailure: true,
          contracts: tokenIds.map((tokenId) => ({
            address: registry,
            abi: ownerOfAbi,
            functionName: 'ownerOf',
            args: [tokenId],
          })),
        }),
        client.multicall({
          ...at,
          contracts: labels.map((label) => ({
            address: registry,
            abi: permissionedRegistryGetResolverSnippet,
            functionName: 'getResolver',
            args: [label],
          })),
        }),
        client.multicall({
          ...at,
          contracts: labels.map((label) => ({
            address: registry,
            abi: permissionedRegistryGetSubregistrySnippet,
            functionName: 'getSubregistry',
            args: [label],
          })),
        }),
        client.multicall({
          ...at,
          contracts: tokenIds.map((tokenId) => ({
            address: registry,
            abi: permissionedRegistryGetExpirySnippet,
            functionName: 'getExpiry',
            args: [tokenId],
          })),
        }),
        client.multicall({
          ...at,
          contracts: tokenIds.map((tokenId) => ({
            address: registry,
            abi: permissionedRegistryGetResourceSnippet,
            functionName: 'getResource',
            args: [tokenId],
          })),
        }),
      ]),
      readError,
    )

  const nameBitmaps = yield* fromPromise(
    client.multicall({
      ...at,
      contracts: resources.flatMap((resource) =>
        accounts.map((account) => ({
          address: registry,
          abi: permissionedRegistryRolesSnippet,
          functionName: 'roles',
          args: [resource, account],
        })),
      ),
    }),
    readError,
  )

  const names: readonly RegistryRepairName[] = labels
    .map((label, i) => {
      const owner = owners[i]
      return {
        label,
        owner: owner?.status === 'success' ? owner.result : zeroAddress,
        resolver: resolvers[i] ?? zeroAddress,
        subregistry: subregistries[i] ?? zeroAddress,
        expiry: expiries[i] ?? 0n,
        roles: grantsOf(
          accounts,
          nameBitmaps.slice(i * accounts.length, (i + 1) * accounts.length),
        ),
      }
    })
    .filter((name) => name.owner !== zeroAddress && name.expiry > now)

  const state: RegistryRepairState = {
    parentRegistry,
    parentLabel,
    parentTokenId,
    rootRoles: grantsOf(accounts, rootBitmaps),
    names,
  }
  return ok(state)
})
