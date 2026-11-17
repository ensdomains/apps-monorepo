import { requireEnsChain } from '@ens-apps/config'
import { parentNameOf } from '@ens-apps/migration'
import type { DestinationContracts } from '@ens-apps/smart-account'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { universalHelperFindRegistriesSnippet } from '@ensdomains/ensjs-abi/v2/universalHelper'
import { verifiableFactoryVerifyContractSnippet } from '@ensdomains/ensjs-abi/v2/verifiableFactory'
import {
  type Address,
  BaseError,
  ContractFunctionRevertedError,
  ContractFunctionZeroDataError,
  isAddressEqual,
  type PublicClient,
  toHex,
  zeroAddress,
} from 'viem'
import { packetToBytes } from 'viem/ens'
import { getChainContractAddress } from 'viem/utils'
import type { ClassifiedName } from './classifyNames'
import type { MigrationJournalOperation } from './migrationBatchJournal'
import { withRequestDeadline } from './requestDeadline'
import { computeUserRegistryAddress } from './userRegistryMigration'

type ParentRegistryContracts = Pick<
  DestinationContracts,
  'verifiableFactory' | 'userRegistryImpl'
>

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
    operations.flatMap(({ name, action }) => {
      const parentName = parentNameOf(name)
      return action === 'copy' && parentName && parentName !== 'eth'
        ? [parentName]
        : []
    }),
  ),
]

/** The replacement a parent now points at; the map is keyed by lowercase name. */
export const currentParentRegistryOf = (
  currentParentRegistries: ReadonlyMap<string, Address>,
  parentName: string,
): Address | undefined => currentParentRegistries.get(parentName.toLowerCase())

export const parentUserRegistryFor = (params: {
  readonly hca: Address
  readonly parentName: string
  readonly currentParentRegistries: ReadonlyMap<string, Address>
}): Address =>
  currentParentRegistryOf(params.currentParentRegistries, params.parentName) ??
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
const isRegistryCandidate = (
  registry: Address,
  hca: Address,
  parentName: string,
): boolean =>
  !isAddressEqual(registry, zeroAddress) &&
  !isAddressEqual(registry, computeUserRegistryAddress({ hca, parentName }))

/** The two chain reads the lookup needs, so tests can pass plain functions. */
export type ParentRegistryReads = {
  /** The registry holding the name's subnames, or zero when it has none. */
  readonly getNameRegistry: (name: string) => Promise<Address>
  readonly verifyContract: (registry: Address) => Promise<Address>
}

export class ParentRegistryReadError extends TaggedError(
  'ParentRegistryReadError',
)<{
  readonly parentName: string
  readonly cause: unknown
}> {}

const readCertifiedRegistry = async (params: {
  readonly reads: ParentRegistryReads
  readonly userRegistryImpl: Address
  readonly hca: Address
  readonly parentName: string
}): Promise<Address | undefined> => {
  const registry = await params.reads.getNameRegistry(params.parentName)
  if (!isRegistryCandidate(registry, params.hca, params.parentName))
    return undefined
  const implementation = await params.reads.verifyContract(registry)
  return isAddressEqual(implementation, params.userRegistryImpl)
    ? registry
    : undefined
}

/** Parents whose name now points at a certified UserRegistry other than the computed one, keyed by lowercase name; a failed read rejects. */
export const findCurrentParentRegistries = async (params: {
  readonly reads: ParentRegistryReads
  readonly userRegistryImpl: Address
  readonly hca: Address
  readonly parentNames: readonly string[]
}): Promise<ReadonlyMap<string, Address>> => {
  const entries = await Promise.all(
    [...new Set(params.parentNames.map((name) => name.toLowerCase()))].map(
      (parentName) =>
        readCertifiedRegistry({ ...params, parentName }).then(
          (registry) =>
            registry === undefined ? [] : [[parentName, registry] as const],
          (cause: unknown) => {
            throw new ParentRegistryReadError({ parentName, cause })
          },
        ),
    ),
  )
  return new Map(entries.flat())
}

// A revert is the chain's answer (not a registry, or not from the factory); only a failed request rejects.
const zeroOnRevert = (error: unknown): Address => {
  const isRevert =
    error instanceof BaseError &&
    error.walk(
      (entry) =>
        entry instanceof ContractFunctionRevertedError ||
        entry instanceof ContractFunctionZeroDataError,
    ) !== null
  if (isRevert) return zeroAddress
  throw error
}

/** {@link findCurrentParentRegistries} over a public client; a client without the helper contract throws before any read. */
export const readCurrentParentRegistries = async (params: {
  readonly publicClient: Pick<PublicClient, 'readContract' | 'chain'>
  readonly contracts: ParentRegistryContracts
  readonly hca: Address
  readonly parentNames: readonly string[]
  readonly signal?: AbortSignal
}): Promise<ReadonlyMap<string, Address>> => {
  if (params.parentNames.length === 0) return new Map()
  const universalHelper = getChainContractAddress({
    chain: requireEnsChain(params.publicClient, 'parent registry lookup'),
    contract: 'ensUniversalHelper',
  })
  const { signal } = params
  return findCurrentParentRegistries({
    reads: {
      getNameRegistry: (name) =>
        withRequestDeadline(
          () =>
            params.publicClient.readContract({
              address: universalHelper,
              abi: universalHelperFindRegistriesSnippet,
              functionName: 'findRegistries',
              args: [toHex(packetToBytes(name))],
            }),
          { signal },
        ).then(([registry]) => registry ?? zeroAddress, zeroOnRevert),
      verifyContract: (registry) =>
        withRequestDeadline(
          () =>
            params.publicClient.readContract({
              address: params.contracts.verifiableFactory,
              abi: verifiableFactoryVerifyContractSnippet,
              functionName: 'verifyContract',
              args: [registry],
            }),
          { signal },
        ).catch(zeroOnRevert),
    },
    userRegistryImpl: params.contracts.userRegistryImpl,
    hca: params.hca,
    parentNames: params.parentNames,
  })
}
