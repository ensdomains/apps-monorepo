import { getDestinationContracts } from '@ens-apps/smart-account'
import { labelToCanonicalId } from '@ensdomains/ensjs/utils/v2'
import { userRegistryRegisterSnippet } from '@ensdomains/ensjs-abi/v2/userRegistry'
import {
  type Address,
  decodeFunctionData,
  type Hex,
  isAddress,
  isAddressEqual,
  keccak256,
  type PublicClient,
  parseAbi,
  stringToHex,
  zeroAddress,
} from 'viem'
import { MIGRATION_HELPER_ABI } from '../contracts/abis'
import { dnsEncodeName } from '../utils/dnsEncodeName'
import type {
  MigrationBatchJournalScope,
  MigrationJournalOperation,
} from './migrationBatchJournal'
import { withRequestDeadline } from './requestDeadline'
import { computeUserRegistryAddress } from './userRegistryMigration'

const STORAGE_PREFIX = 'ens-apps:migration-completion:v1:'
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>
const verifiedCheckpoints = new WeakMap<StorageLike, Map<string, string>>()
const rememberVerifiedCheckpoint = (
  storage: StorageLike,
  scope: MigrationBatchJournalScope,
  checkpoint: MigrationCompletionCheckpoint,
): void => {
  const entries = verifiedCheckpoints.get(storage) ?? new Map<string, string>()
  entries.set(storageKey(scope), JSON.stringify(checkpoint))
  verifiedCheckpoints.set(storage, entries)
}
type MigrationCompletionCheckpoint = {
  readonly version: 1
  readonly deployment: string
  readonly transactionHash: Hex
  readonly operation: MigrationJournalOperation
}

const ownerExecutionAbi = parseAbi([
  'function executeByOwner((address target, uint256 value, bytes callData)[] executions) payable',
])
const proofAbi = parseAbi([
  'function owner() view returns (address)',
  'function authorizedOwnerOf(address hca) view returns (address)',
  'function verifyContract(address proxy) view returns (address)',
  'function getSubregistry(string label) view returns (address)',
  'function getOwner(uint256 resource) view returns (address)',
])
const storageKey = (scope: MigrationBatchJournalScope) =>
  `${STORAGE_PREFIX}${scope.chainId}:${scope.owner.toLowerCase()}:${scope.hca.toLowerCase()}`
const deploymentKey = (chainId: number): string => {
  const contracts = getDestinationContracts(chainId)
  return keccak256(
    stringToHex(
      [
        contracts.ethRegistry,
        contracts.migrationHelper,
        contracts.verifiableFactory,
        contracts.standaloneHcaFactory,
        contracts.standaloneHcaImplementation,
        contracts.userRegistryImpl,
        contracts.verifiableFactoryProxyLogic,
      ]
        .join(':')
        .toLowerCase(),
    ),
  )
}

export const getMigrationCompletionDeploymentIdentity = (
  chainId: number,
): string | undefined => {
  try {
    return deploymentKey(chainId)
  } catch {
    return undefined
  }
}

const validScope = (scope: MigrationBatchJournalScope): boolean =>
  Number.isSafeInteger(scope.chainId) &&
  scope.chainId > 0 &&
  [scope.owner, scope.hca].every(
    (address) => isAddress(address) && !isAddressEqual(address, zeroAddress),
  )
const validOperation = (
  operation: unknown,
): operation is MigrationJournalOperation => {
  if (!operation || typeof operation !== 'object') return false
  const value = operation as Record<string, unknown>
  return (
    typeof value.name === 'string' &&
    value.name.endsWith('.eth') &&
    value.name === value.name.trim() &&
    value.name.split('.').every(Boolean) &&
    (value.action === 'migrate' || value.action === 'copy')
  )
}

/** One verified operation is enough to prove a migration happened, never that all names are done. */
export const persistMigrationCompletionCheckpoint = (params: {
  readonly scope: MigrationBatchJournalScope
  readonly transactionHash: Hex
  readonly operations: readonly MigrationJournalOperation[]
  readonly storage?: StorageLike
}): void => {
  const operation =
    params.operations.find(({ action }) => action === 'migrate') ??
    params.operations[0]
  if (
    !validScope(params.scope) ||
    !validOperation(operation) ||
    !/^0x[\da-f]{64}$/i.test(params.transactionHash)
  ) {
    throw new Error('Invalid migration completion checkpoint')
  }
  const checkpoint: MigrationCompletionCheckpoint = {
    version: 1,
    deployment: deploymentKey(params.scope.chainId),
    transactionHash: params.transactionHash,
    operation: { name: operation.name.toLowerCase(), action: operation.action },
  }
  // If this write fails, callers retain the submitted journal for recovery.
  const storage = params.storage ?? globalThis.localStorage
  if (operation.action === 'copy') {
    // A previous checkpoint remains untrusted until restoration verifies it.
    // Keep a same-deployment direct migration reference, which is cheaper and
    // more stable to restore than a nested copy registry path.
    try {
      const previous = loadCheckpoint(params.scope, storage)
      if (
        previous?.operation.action === 'migrate' &&
        verifiedCheckpoints.get(storage)?.get(storageKey(params.scope)) ===
          JSON.stringify(previous)
      )
        return
    } catch {
      // Replace malformed or older-deployment hints with the just-verified batch.
    }
  }
  storage.setItem(storageKey(params.scope), JSON.stringify(checkpoint))
  rememberVerifiedCheckpoint(storage, params.scope, checkpoint)
}

const loadCheckpoint = (
  scope: MigrationBatchJournalScope,
  storage: StorageLike,
): MigrationCompletionCheckpoint | null => {
  const raw = storage.getItem(storageKey(scope))
  if (!raw) return null
  const value = JSON.parse(raw) as Partial<MigrationCompletionCheckpoint> | null
  if (
    value?.version !== 1 ||
    value.deployment !== deploymentKey(scope.chainId) ||
    typeof value.transactionHash !== 'string' ||
    !/^0x[\da-f]{64}$/i.test(value.transactionHash) ||
    !validOperation(value.operation)
  )
    throw new Error('Invalid migration completion checkpoint')
  return value as MigrationCompletionCheckpoint
}

type InnerExecution = {
  readonly target: Address
  readonly value: bigint
  readonly callData: Hex
}
const hasMigrationCall = (params: {
  readonly call: InnerExecution
  readonly operation: MigrationJournalOperation
  readonly owner: Address
  readonly helper: Address
  readonly registry: Address
}): boolean => {
  const { call, operation } = params
  if (call.value !== 0n) return false
  const [label, ...parentLabels] = operation.name.split('.')
  const parent = parentLabels.join('.')
  try {
    if (operation.action === 'copy') {
      if (!isAddressEqual(call.target, params.registry)) return false
      const { args } = decodeFunctionData({
        abi: userRegistryRegisterSnippet,
        data: call.callData,
      })
      return args[0] === label && isAddressEqual(args[1], params.owner)
    }
    if (!isAddressEqual(call.target, params.helper)) return false
    const { args } = decodeFunctionData({
      abi: MIGRATION_HELPER_ABI,
      data: call.callData,
    })
    const [unwrapped, unlocked, locked, children] = args
    const records =
      parent === 'eth'
        ? [...unwrapped, ...unlocked.flat(), ...locked.flat()]
        : children
            .filter(
              (group) =>
                group.parentName.toLowerCase() ===
                dnsEncodeName(parent).toLowerCase(),
            )
            .flatMap((group) => group.groups.flat())
    return records.some(
      (record) =>
        record.label === label && isAddressEqual(record.owner, params.owner),
    )
  } catch {
    return false
  }
}

type ProofRead = (
  address: Address,
  functionName:
    | 'owner'
    | 'authorizedOwnerOf'
    | 'verifyContract'
    | 'getSubregistry'
    | 'getOwner',
  args?: readonly unknown[],
) => Promise<Address>

const verifyCheckpointOperation = async (params: {
  readonly operation: MigrationJournalOperation
  readonly owner: Address
  readonly ethRegistry: Address
  readonly hca: Address
  readonly factory: Address
  readonly userRegistryImplementation: Address
  readonly helper: Address
  readonly executions: readonly InnerExecution[]
  readonly read: ProofRead
}): Promise<void> => {
  if (!validOperation(params.operation))
    throw new Error('Migration checkpoint name is invalid')
  const [label, ...parents] = params.operation.name.split('.')
  if (!label) throw new Error('Migration checkpoint name is invalid')
  let registry = params.ethRegistry
  for (const parent of parents.slice(0, -1).reverse()) {
    registry = await params.read(registry, 'getSubregistry', [parent])
    if (isAddressEqual(registry, zeroAddress))
      throw new Error('Migration checkpoint registry is missing')
  }
  if (params.operation.action === 'copy') {
    const expectedRegistry = computeUserRegistryAddress({
      hca: params.hca,
      parentName: parents.join('.'),
    })
    if (!isAddressEqual(registry, expectedRegistry))
      throw new Error('Migration checkpoint copy registry is invalid')
    const implementation = await params.read(params.factory, 'verifyContract', [
      registry,
    ])
    if (!isAddressEqual(implementation, params.userRegistryImplementation))
      throw new Error('Migration checkpoint copy implementation is invalid')
  }
  if (
    !params.executions.some((call) =>
      hasMigrationCall({
        call,
        operation: params.operation,
        owner: params.owner,
        helper: params.helper,
        registry,
      }),
    )
  ) {
    throw new Error('Migration checkpoint calldata does not upgrade this name')
  }
  const nameOwner = await params.read(registry, 'getOwner', [
    labelToCanonicalId(label),
  ])
  if (!isAddressEqual(nameOwner, params.owner))
    throw new Error('Migration checkpoint name ownership is invalid')
}

const verifyCheckpoint = async (params: {
  readonly publicClient: PublicClient
  readonly scope: MigrationBatchJournalScope
  readonly checkpoint: MigrationCompletionCheckpoint
  readonly operations?: readonly MigrationJournalOperation[]
  readonly signal: AbortSignal
}): Promise<MigrationJournalOperation> => {
  const { publicClient, scope, checkpoint, signal } = params
  const contracts = getDestinationContracts(scope.chainId)
  const [receipt, transaction] = await Promise.all([
    withRequestDeadline(
      () =>
        publicClient.getTransactionReceipt({
          hash: checkpoint.transactionHash,
        }),
      { signal },
    ),
    withRequestDeadline(
      () => publicClient.getTransaction({ hash: checkpoint.transactionHash }),
      { signal },
    ),
  ])
  if (
    receipt.status !== 'success' ||
    !transaction.to ||
    !receipt.to ||
    transaction.hash.toLowerCase() !==
      checkpoint.transactionHash.toLowerCase() ||
    receipt.transactionHash.toLowerCase() !==
      checkpoint.transactionHash.toLowerCase() ||
    transaction.blockHash !== receipt.blockHash ||
    transaction.blockNumber !== receipt.blockNumber ||
    !isAddressEqual(transaction.from, scope.owner) ||
    !isAddressEqual(receipt.from, scope.owner) ||
    !isAddressEqual(transaction.to, scope.hca) ||
    !isAddressEqual(receipt.to, scope.hca)
  ) {
    throw new Error(
      'Migration checkpoint transaction does not match this account',
    )
  }
  const reads = new Map<string, Promise<Address>>()
  const read: ProofRead = (address, functionName, args) => {
    const key = `${address.toLowerCase()}:${functionName}:${args?.map(String).join(':') ?? ''}`
    const previous = reads.get(key)
    if (previous) return previous
    const pending = withRequestDeadline(
      () =>
        publicClient.readContract({
          address,
          abi: proofAbi,
          functionName,
          args,
          blockNumber: receipt.blockNumber,
        } as Parameters<PublicClient['readContract']>[0]) as Promise<Address>,
      { signal },
    )
    reads.set(key, pending)
    return pending
  }
  const [owner, authorizedOwner, implementation] = await Promise.all([
    read(scope.hca, 'owner'),
    read(contracts.standaloneHcaFactory, 'authorizedOwnerOf', [scope.hca]),
    read(contracts.verifiableFactory, 'verifyContract', [scope.hca]),
  ])
  if (
    !isAddressEqual(owner, scope.owner) ||
    !isAddressEqual(authorizedOwner, scope.owner) ||
    !isAddressEqual(implementation, contracts.standaloneHcaImplementation)
  )
    throw new Error('Migration checkpoint HCA is invalid')
  const {
    args: [executions],
  } = decodeFunctionData({ abi: ownerExecutionAbi, data: transaction.input })
  for (const operation of params.operations ?? [checkpoint.operation]) {
    signal.throwIfAborted()
    await verifyCheckpointOperation({
      operation,
      owner: scope.owner,
      ethRegistry: contracts.ethRegistry,
      hca: scope.hca,
      factory: contracts.verifiableFactory,
      userRegistryImplementation: contracts.userRegistryImpl,
      helper: contracts.migrationHelper,
      executions,
      read,
    })
  }
  signal.throwIfAborted()
  return checkpoint.operation
}

/** Storage is untrusted: restore evidence only from the canonical receipt and its historical post-state. */
export const restoreMigrationCompletionCheckpoint = async (params: {
  readonly scope: MigrationBatchJournalScope
  readonly publicClient: PublicClient
  readonly signal?: AbortSignal
  readonly storage?: StorageLike
}): Promise<MigrationJournalOperation | null> => {
  if (
    !validScope(params.scope) ||
    params.publicClient.chain?.id !== params.scope.chainId
  )
    throw new Error('Migration checkpoint scope is invalid')
  const checkpoint = loadCheckpoint(
    params.scope,
    params.storage ?? globalThis.localStorage,
  )
  if (!checkpoint) return null
  const operation = await withRequestDeadline(
    (signal) => verifyCheckpoint({ ...params, checkpoint, signal }),
    { signal: params.signal, timeoutMs: 30_000 },
  )
  rememberVerifiedCheckpoint(
    params.storage ?? globalThis.localStorage,
    params.scope,
    checkpoint,
  )
  return operation
}

/** Recover older submitted journals only after proving every recorded operation. */
export const verifyAndPersistMigrationCompletionCheckpoint = async (params: {
  readonly scope: MigrationBatchJournalScope
  readonly publicClient: PublicClient
  readonly transactionHash: Hex
  readonly operations: readonly MigrationJournalOperation[]
  readonly signal?: AbortSignal
  readonly storage?: StorageLike
}): Promise<void> => {
  const operation = params.operations[0]
  if (
    !validScope(params.scope) ||
    !operation ||
    !params.operations.every(validOperation) ||
    params.publicClient.chain?.id !== params.scope.chainId
  ) {
    throw new Error('Migration checkpoint scope or operations are invalid')
  }
  const checkpoint: MigrationCompletionCheckpoint = {
    version: 1,
    deployment: deploymentKey(params.scope.chainId),
    transactionHash: params.transactionHash,
    operation,
  }
  await withRequestDeadline(
    (signal) => verifyCheckpoint({ ...params, checkpoint, signal }),
    { signal: params.signal, timeoutMs: 30_000 },
  )
  params.signal?.throwIfAborted()
  persistMigrationCompletionCheckpoint(params)
}
