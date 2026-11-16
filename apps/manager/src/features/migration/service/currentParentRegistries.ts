import type { DestinationContracts } from '@ens-apps/smart-account'
import { permissionedRegistryGetSubregistrySnippet } from '@ensdomains/ensjs-abi/v2/permissionedRegistry'
import { verifiableFactoryVerifyContractSnippet } from '@ensdomains/ensjs-abi/v2/verifiableFactory'
import {
  type Address,
  isAddress,
  isAddressEqual,
  type PublicClient,
  zeroAddress,
} from 'viem'
import type { ClassifiedName } from './classifyNames'
import type { MigrationJournalOperation } from './migrationBatchJournal'
import { computeUserRegistryAddress } from './userRegistryMigration'

export type ParentRegistryRead = {
  readonly parentName: string
  readonly registry: Address | undefined
  readonly implementation: Address | undefined
}

export type ParentRegistryContracts = Pick<
  DestinationContracts,
  'ethRegistry' | 'verifiableFactory' | 'userRegistryImpl'
>

const EMPTY_PARENT_REGISTRIES: ReadonlyMap<string, Address> = new Map()

/** Parents whose name now points at a certified UserRegistry other than the computed one. */
export const toCurrentParentRegistries = (params: {
  readonly hca: Address
  readonly userRegistryImpl: Address
  readonly reads: readonly ParentRegistryRead[]
}): ReadonlyMap<string, Address> =>
  new Map(
    params.reads.flatMap(({ parentName, registry, implementation }) =>
      registry !== undefined &&
      implementation !== undefined &&
      !isAddressEqual(registry, zeroAddress) &&
      !isAddressEqual(
        registry,
        computeUserRegistryAddress({ hca: params.hca, parentName }),
      ) &&
      isAddressEqual(implementation, params.userRegistryImpl)
        ? [[parentName, registry] as const]
        : [],
    ),
  )

/** Copy parents already on chain before this run; none when nothing is left to plan. */
export const completedCopyParentNames = (params: {
  readonly registryContext: readonly ClassifiedName[]
  readonly remaining: readonly ClassifiedName[]
}): readonly string[] => {
  if (params.remaining.length === 0) return []
  const remainingNames = new Set(
    params.remaining.map(({ domain }) => domain.name.toLowerCase()),
  )
  return [
    ...new Set(
      params.registryContext.flatMap((name) =>
        name.action === 'copy' &&
        name.parentName &&
        name.parentName !== 'eth' &&
        !remainingNames.has(name.parentName.toLowerCase())
          ? [name.parentName]
          : [],
      ),
    ),
  ]
}

/** Parents of the copied names in a journaled attempt. */
export const copyParentNames = (
  operations: readonly MigrationJournalOperation[],
): readonly string[] => [
  ...new Set(
    operations.flatMap(({ name, action }) =>
      action === 'copy' ? [name.split('.').slice(1).join('.')] : [],
    ),
  ),
]

/** Drop overrides for names this run deploys: those keep the computed registry. */
export const withoutDeployedParents = (params: {
  readonly currentParentRegistries?: ReadonlyMap<string, Address>
  readonly deployed: readonly ClassifiedName[]
}): ReadonlyMap<string, Address> => {
  const deployedNames = new Set(
    params.deployed.map(({ domain }) => domain.name.toLowerCase()),
  )
  return new Map(
    [...(params.currentParentRegistries ?? EMPTY_PARENT_REGISTRIES)].filter(
      ([parentName]) => !deployedNames.has(parentName.toLowerCase()),
    ),
  )
}

export const parentUserRegistryFor = (params: {
  readonly hca: Address
  readonly parentName: string
  readonly currentParentRegistries: ReadonlyMap<string, Address>
}): Address =>
  params.currentParentRegistries.get(params.parentName) ??
  computeUserRegistryAddress(params)

const readAddress = (
  read: () => Promise<Address>,
): Promise<Address | undefined> =>
  Promise.resolve()
    .then(read)
    .then(
      (value) => (isAddress(value, { strict: false }) ? value : undefined),
      () => undefined,
    )

const readNameRegistry = (
  publicClient: PublicClient,
  ethRegistry: Address,
  parentName: string,
): Promise<Address | undefined> =>
  parentName
    .split('.')
    .slice(0, -1)
    .reverse()
    .reduce<Promise<Address | undefined>>(async (pending, label) => {
      const registry = await pending
      if (!registry || isAddressEqual(registry, zeroAddress)) return undefined
      return readAddress(() =>
        publicClient.readContract({
          address: registry,
          abi: permissionedRegistryGetSubregistrySnippet,
          functionName: 'getSubregistry',
          args: [label],
        }),
      )
    }, Promise.resolve(ethRegistry))

const readParentRegistry = async (params: {
  readonly publicClient: PublicClient
  readonly contracts: ParentRegistryContracts
  readonly hca: Address
  readonly parentName: string
}): Promise<ParentRegistryRead> => {
  const registry = await readNameRegistry(
    params.publicClient,
    params.contracts.ethRegistry,
    params.parentName,
  )
  const isCandidate =
    registry !== undefined &&
    !isAddressEqual(registry, zeroAddress) &&
    !isAddressEqual(registry, computeUserRegistryAddress(params))
  const implementation = isCandidate
    ? await readAddress(() =>
        params.publicClient.readContract({
          address: params.contracts.verifiableFactory,
          abi: verifiableFactoryVerifyContractSnippet,
          functionName: 'verifyContract',
          args: [registry],
        }),
      )
    : undefined
  return { parentName: params.parentName, registry, implementation }
}

/** A failed read leaves that parent out, so readiness checks the computed registry as before. */
export const readCurrentParentRegistries = async (params: {
  readonly publicClient: PublicClient
  readonly contracts: ParentRegistryContracts
  readonly hca: Address
  readonly parentNames: readonly string[]
}): Promise<ReadonlyMap<string, Address>> => {
  if (params.parentNames.length === 0) return EMPTY_PARENT_REGISTRIES
  const reads = await Promise.all(
    [...new Set(params.parentNames)].map((parentName) =>
      readParentRegistry({
        publicClient: params.publicClient,
        contracts: params.contracts,
        hca: params.hca,
        parentName,
      }),
    ),
  )
  return toCurrentParentRegistries({
    hca: params.hca,
    userRegistryImpl: params.contracts.userRegistryImpl,
    reads,
  })
}
