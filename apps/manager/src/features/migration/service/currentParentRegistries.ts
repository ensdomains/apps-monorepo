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

/** A copy's registry is the one the HCA deployed, or the certified replacement its parent now points at. */
export const isAcceptedParentRegistry = (params: {
  readonly registry: Address
  readonly expectedRegistry: Address
  readonly currentRegistry: Address | undefined
}): boolean =>
  isAddressEqual(params.registry, params.expectedRegistry) ||
  (params.currentRegistry !== undefined &&
    isAddressEqual(params.registry, params.currentRegistry))

/** A registry worth asking the factory about: set, and not the address the HCA would have deployed. */
export const isRegistryCandidate = (params: {
  readonly registry: Address | undefined
  readonly hca: Address
  readonly parentName: string
}): params is { readonly registry: Address } & typeof params =>
  params.registry !== undefined &&
  !isAddressEqual(params.registry, zeroAddress) &&
  !isAddressEqual(
    params.registry,
    computeUserRegistryAddress({
      hca: params.hca,
      parentName: params.parentName,
    }),
  )

/** The two chain reads the lookup needs, so tests can pass plain functions. */
export type ParentRegistryReads = {
  readonly getSubregistry: (
    registry: Address,
    label: string,
  ) => Promise<Address>
  readonly verifyContract: (registry: Address) => Promise<Address>
}

// A failed or malformed read (thrown or rejected) counts as unknown, leaving the parent on its computed registry.
const settledAddress = (
  read: () => Promise<Address>,
): Promise<Address | undefined> =>
  Promise.resolve()
    .then(read)
    .then(
      (value) => (isAddress(value, { strict: false }) ? value : undefined),
      () => undefined,
    )

const readNameRegistry = (
  reads: ParentRegistryReads,
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
      return settledAddress(() => reads.getSubregistry(registry, label))
    }, Promise.resolve(ethRegistry))

const readParentRegistry = async (params: {
  readonly reads: ParentRegistryReads
  readonly ethRegistry: Address
  readonly hca: Address
  readonly parentName: string
}): Promise<ParentRegistryRead> => {
  const registry = await readNameRegistry(
    params.reads,
    params.ethRegistry,
    params.parentName,
  )
  const candidate = { registry, hca: params.hca, parentName: params.parentName }
  const implementation = isRegistryCandidate(candidate)
    ? await settledAddress(() =>
        params.reads.verifyContract(candidate.registry),
      )
    : undefined
  return { parentName: params.parentName, registry, implementation }
}

/** Parents whose name now points at a certified replacement registry, from the given reads. */
export const findCurrentParentRegistries = async (params: {
  readonly reads: ParentRegistryReads
  readonly ethRegistry: Address
  readonly userRegistryImpl: Address
  readonly hca: Address
  readonly parentNames: readonly string[]
}): Promise<ReadonlyMap<string, Address>> => {
  if (params.parentNames.length === 0) return EMPTY_PARENT_REGISTRIES
  const reads = await Promise.all(
    [...new Set(params.parentNames)].map((parentName) =>
      readParentRegistry({
        reads: params.reads,
        ethRegistry: params.ethRegistry,
        hca: params.hca,
        parentName,
      }),
    ),
  )
  return toCurrentParentRegistries({
    hca: params.hca,
    userRegistryImpl: params.userRegistryImpl,
    reads,
  })
}

/** {@link findCurrentParentRegistries} over a public client. */
export const readCurrentParentRegistries = (params: {
  readonly publicClient: PublicClient
  readonly contracts: ParentRegistryContracts
  readonly hca: Address
  readonly parentNames: readonly string[]
}): Promise<ReadonlyMap<string, Address>> =>
  findCurrentParentRegistries({
    reads: {
      getSubregistry: (registry, label) =>
        params.publicClient.readContract({
          address: registry,
          abi: permissionedRegistryGetSubregistrySnippet,
          functionName: 'getSubregistry',
          args: [label],
        }),
      verifyContract: (registry) =>
        params.publicClient.readContract({
          address: params.contracts.verifiableFactory,
          abi: verifiableFactoryVerifyContractSnippet,
          functionName: 'verifyContract',
          args: [registry],
        }),
    },
    ethRegistry: params.contracts.ethRegistry,
    userRegistryImpl: params.contracts.userRegistryImpl,
    hca: params.hca,
    parentNames: params.parentNames,
  })
