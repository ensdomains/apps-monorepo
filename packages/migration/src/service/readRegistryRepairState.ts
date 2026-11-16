import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { registryRoles } from '@ensdomains/ensjs/utils/v2'
import {
  eacHasRolesSnippet,
  eacRolesChangedEventSnippet,
} from '@ensdomains/ensjs-abi/v2/enhancedAccessControl'
import {
  permissionedRegistryGetResolverSnippet,
  permissionedRegistryGetStateSnippet,
  permissionedRegistryGetSubregistrySnippet,
  permissionedRegistryGetTokenIdSnippet,
  permissionedRegistryRolesSnippet,
} from '@ensdomains/ensjs-abi/v2/permissionedRegistry'
import { labelRegisteredEventSnippet } from '@ensdomains/ensjs-abi/v2/userRegistry'
import { fromPromise, ok } from 'neverthrow'
import {
  type Address,
  type GetBlockErrorType,
  type GetLogsErrorType,
  isAddressEqual,
  type MulticallErrorType,
  type PublicClient,
  parseAbi,
  type ReadContractErrorType,
  zeroAddress,
} from 'viem'
import { toRegistryChildren } from './registryRepairChildren'
import {
  explicitNameGrants,
  grantsOf,
  literalLabelId,
  nameGrantsOf,
  type RegistryCandidates,
  type RegistryRepairName,
  type RegistryRepairState,
  splitRepairNames,
  uniqueCandidates,
} from './registryRepairState'

/** The reads a registry repair needs, so any chain's public client fits. */
export type RepairReadClient = Pick<
  PublicClient,
  'getBlock' | 'getLogs' | 'readContract' | 'multicall'
>

const ROOT_RESOURCE = 0n
const MIN_LOG_RANGE = 500n
const DEFAULT_LOG_RANGE = 50_000n

const getParentAbi = parseAbi([
  'function getParent() view returns (address parent, string label)',
])
const isApprovedForAllAbi = parseAbi([
  'function isApprovedForAll(address owner, address operator) view returns (bool)',
])
const EVENTS = [
  ...labelRegisteredEventSnippet,
  ...eacRolesChangedEventSnippet,
] as const

type RegistryRepairReadCause =
  | GetBlockErrorType
  | GetLogsErrorType
  | ReadContractErrorType
  | MulticallErrorType

export class RegistryRepairReadError extends TaggedError(
  'RegistryRepairReadError',
)<{
  readonly cause: RegistryRepairReadCause
}> {}

/** Every label the registry registered and every account whose roles on it changed, between two blocks. */
const readCandidates = async (params: {
  readonly client: RepairReadClient
  readonly registry: Address
  readonly fromBlock: bigint
  readonly toBlock: bigint
  readonly maxRange: bigint
}): Promise<RegistryCandidates> => {
  const collect = async (
    from: bigint,
    range: bigint,
    found: RegistryCandidates,
  ): Promise<RegistryCandidates> => {
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
  return uniqueCandidates(found)
}

const readError = (cause: unknown) =>
  new RegistryRepairReadError({ cause: cause as RegistryRepairReadCause })

/** What a copy of `registry` must reproduce, read at one block; names count while owned and unexpired at that block's time. */
export const readRegistryRepairState = ResultFn(async function* (params: {
  readonly client: RepairReadClient
  readonly registry: Address
  readonly fromBlock: bigint
  readonly maxLogRange?: bigint
  /** Where the name lives, when known; otherwise read from the registry's own `getParent`, which may be unset. */
  readonly parent?: { readonly registry: Address; readonly label: string }
}) {
  const { client, registry } = params
  // One block for every read, and its time decides which names have expired, as `register` will.
  const block = yield* fromPromise(client.getBlock(), readError)
  const blockNumber = block.number
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

  const [parentRegistry, parentLabel] = params.parent
    ? [params.parent.registry, params.parent.label]
    : yield* fromPromise(
        client.readContract({
          address: registry,
          abi: getParentAbi,
          functionName: 'getParent',
          blockNumber,
        }),
        readError,
      )
  const [parentTokenId, states, rootBitmaps] = yield* fromPromise(
    Promise.all([
      // A replacement whose parent isn't set yet has no parent token to read.
      isAddressEqual(parentRegistry, zeroAddress)
        ? 0n
        : client.readContract({
            address: parentRegistry,
            abi: permissionedRegistryGetTokenIdSnippet,
            functionName: 'getTokenId',
            args: [literalLabelId(parentLabel)],
            blockNumber,
          }),
      client.multicall({
        ...at,
        contracts: labels.map((label) => ({
          address: registry,
          abi: permissionedRegistryGetStateSnippet,
          functionName: 'getState',
          args: [literalLabelId(label)],
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

  const [resolvers, subregistries] = yield* fromPromise(
    Promise.all([
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
    ]),
    readError,
  )

  const nameBitmaps = yield* fromPromise(
    client.multicall({
      ...at,
      contracts: states.flatMap(({ resource }) =>
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

  const ownerOf = (i: number) => states[i]?.latestOwner ?? zeroAddress
  const nameGrants = nameGrantsOf(accounts, nameBitmaps, labels.length)
  // `roles()` adds the owner's roles for accounts the owner approved for all, so read which ones are.
  const approvalChecks = nameGrants.flatMap((grants, index) =>
    grants
      .filter((grant) => !isAddressEqual(grant.account, ownerOf(index)))
      .map((grant) => ({ index, account: grant.account })),
  )
  const approvals = yield* fromPromise(
    client.multicall({
      ...at,
      contracts: approvalChecks.map(({ index, account }) => ({
        address: registry,
        abi: isApprovedForAllAbi,
        functionName: 'isApprovedForAll',
        args: [ownerOf(index), account],
      })),
    }),
    readError,
  )

  const allNames: readonly RegistryRepairName[] = labels.map((label, i) => ({
    label,
    owner: ownerOf(i),
    resolver: resolvers[i] ?? zeroAddress,
    subregistry: subregistries[i] ?? zeroAddress,
    expiry: states[i]?.expiry ?? 0n,
    roles: explicitNameGrants({
      grants: nameGrants[i] ?? [],
      owner: ownerOf(i),
      approvedAccounts: approvalChecks
        .filter((check, j) => check.index === i && approvals[j] === true)
        .map((check) => check.account),
    }),
  }))
  const state: RegistryRepairState = {
    parentRegistry,
    parentLabel,
    parentTokenId,
    rootRoles: grantsOf(accounts, rootBitmaps),
    ...splitRepairNames(allNames, block.timestamp),
  }
  return ok(state)
})

/** What happens to each child registry under `names`; `fromRegistries` is the registry being upgraded plus any replacement an earlier attempt abandoned. */
export const readChildRegistries = (params: {
  readonly client: RepairReadClient
  readonly fromRegistries: readonly Address[]
  readonly names: readonly RegistryRepairName[]
  readonly account: Address
}) => {
  const { client, account } = params
  const names = params.names.filter(
    (name) => !isAddressEqual(name.subregistry, zeroAddress),
  )
  return fromPromise(
    Promise.all([
      client.multicall({
        allowFailure: true,
        contracts: names.map((name) => ({
          address: name.subregistry,
          abi: getParentAbi,
          functionName: 'getParent',
        })),
      }),
      client.multicall({
        allowFailure: true,
        contracts: names.map((name) => ({
          address: name.subregistry,
          abi: eacHasRolesSnippet,
          functionName: 'hasRoles',
          args: [ROOT_RESOURCE, registryRoles.ROLE_SET_PARENT, account],
        })),
      }),
    ]),
    readError,
  ).map(([parents, roles]) =>
    toRegistryChildren({
      fromRegistries: params.fromRegistries,
      entries: names.map((name, i) => {
        const parent = parents[i]
        const role = roles[i]
        return {
          name,
          parent: parent?.status === 'success' ? parent.result : null,
          canSetParent: role?.status === 'success' && role.result,
        }
      }),
    }),
  )
}
