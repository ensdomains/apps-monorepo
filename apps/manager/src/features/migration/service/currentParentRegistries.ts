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
import { computeUserRegistryAddress } from './userRegistryMigration'

type ParentRegistryContracts = Pick<
  DestinationContracts,
  'verifiableFactory' | 'userRegistryImpl'
>

const EMPTY_PARENT_REGISTRIES: ReadonlyMap<string, Address> = new Map()

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
      const parentName = name.split('.').slice(1).join('.')
      return action === 'copy' && parentName !== 'eth' ? [parentName] : []
    }),
  ),
]

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

/** Parents whose name now points at a certified UserRegistry other than the computed one; a failed read rejects. */
export const findCurrentParentRegistries = async (params: {
  readonly reads: ParentRegistryReads
  readonly userRegistryImpl: Address
  readonly hca: Address
  readonly parentNames: readonly string[]
}): Promise<ReadonlyMap<string, Address>> => {
  if (params.parentNames.length === 0) return EMPTY_PARENT_REGISTRIES
  const entries = await Promise.all(
    [...new Set(params.parentNames)].map((parentName) =>
      Promise.resolve()
        .then(() => readCertifiedRegistry({ ...params, parentName }))
        .then(
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

const unknownChain = (): never => {
  throw new Error('The client has no chain to find the universal helper on')
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

/** {@link findCurrentParentRegistries} over a public client. */
export const readCurrentParentRegistries = (params: {
  readonly publicClient: Pick<PublicClient, 'readContract' | 'chain'>
  readonly contracts: ParentRegistryContracts
  readonly hca: Address
  readonly parentNames: readonly string[]
}): Promise<ReadonlyMap<string, Address>> =>
  findCurrentParentRegistries({
    reads: {
      getNameRegistry: (name) =>
        params.publicClient
          .readContract({
            address: getChainContractAddress({
              chain: params.publicClient.chain ?? unknownChain(),
              contract: 'ensUniversalHelper',
            }),
            abi: universalHelperFindRegistriesSnippet,
            functionName: 'findRegistries',
            args: [toHex(packetToBytes(name))],
          })
          .then(([registry]) => registry ?? zeroAddress, zeroOnRevert),
      verifyContract: (registry) =>
        params.publicClient
          .readContract({
            address: params.contracts.verifiableFactory,
            abi: verifiableFactoryVerifyContractSnippet,
            functionName: 'verifyContract',
            args: [registry],
          })
          .catch(zeroOnRevert),
    },
    userRegistryImpl: params.contracts.userRegistryImpl,
    hca: params.hca,
    parentNames: params.parentNames,
  })
