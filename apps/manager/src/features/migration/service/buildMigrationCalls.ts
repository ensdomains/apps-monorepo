import type { Address, Hex } from 'viem'
import { BASE_REGISTRAR_ABI, NAME_WRAPPER_ABI } from '../contracts/abis'
import { V1_CONTRACTS, V2_CONTRACTS } from '../contracts/addresses'
import { type ClassifiedName, FUSES, hasFuse } from './classifyNames'
import {
  createMigrationData,
  encodeMigrationData,
  encodeMigrationDataBatch,
} from './encodeMigration'

// --- Types ---

export type UnwrappedMigrationCall = {
  type: 'unwrapped'
  name: ClassifiedName
  request: {
    address: Address
    abi: typeof BASE_REGISTRAR_ABI
    functionName: 'safeTransferFrom'
    args: readonly [Address, Address, bigint, Hex]
  }
}

export type WrappedSingleMigrationCall = {
  type: 'wrapped-single'
  name: ClassifiedName
  request: {
    address: Address
    abi: typeof NAME_WRAPPER_ABI
    functionName: 'safeTransferFrom'
    args: readonly [Address, Address, bigint, bigint, Hex]
  }
}

export type WrappedBatchMigrationCall = {
  type: 'wrapped-batch'
  names: ClassifiedName[]
  request: {
    address: Address
    abi: typeof NAME_WRAPPER_ABI
    functionName: 'safeBatchTransferFrom'
    args: readonly [Address, Address, bigint[], bigint[], Hex]
  }
}

export type MigrationCall =
  | UnwrappedMigrationCall
  | WrappedSingleMigrationCall
  | WrappedBatchMigrationCall

// --- Token ID helpers ---

/**
 * Get the token ID for a classified name.
 *
 * Unwrapped (BaseRegistrar ERC-721): tokenId = labelhash
 * Wrapped (NameWrapper ERC-1155): tokenId = namehash (domain.id from subgraph)
 */
function getTokenId(name: ClassifiedName): bigint {
  if (name.tokenType === 'unwrapped') {
    return BigInt(name.domain.labelhash)
  }
  return BigInt(name.domain.id)
}

/**
 * Get the migration controller address for a given token type.
 */
function getMigrationTarget(
  tokenType: ClassifiedName['tokenType'],
  parentWrapperRegistry?: Address,
): Address {
  switch (tokenType) {
    case 'unwrapped':
    case 'unlocked':
      return V2_CONTRACTS.UnlockedMigrationController
    case 'locked-2ld':
      return V2_CONTRACTS.LockedMigrationController
    case 'locked-child':
      if (!parentWrapperRegistry) {
        throw new Error(
          'Parent WrapperRegistry address required for locked child migration',
        )
      }
      return parentWrapperRegistry
  }
}

/**
 * Determine the resolver address for a name in the v2 migration data.
 *
 * Per the migration spec:
 * - Locked names with CANNOT_SET_RESOLVER burned: use the current v1 resolver
 *   (the contract preserves it and ignores Data.resolver)
 * - All other names: use the ENSV2Resolver
 */
function getResolverForName(
  name: ClassifiedName,
  defaultResolver: Address,
): Address {
  const isLocked =
    name.tokenType === 'locked-2ld' || name.tokenType === 'locked-child'

  if (
    isLocked &&
    hasFuse(name.fuses, FUSES.CANNOT_SET_RESOLVER) &&
    name.v1ResolverAddress
  ) {
    return name.v1ResolverAddress as Address
  }

  return defaultResolver
}

// --- Call builders ---

/**
 * Build a single ERC-721 safeTransferFrom call for an unwrapped name.
 * BaseRegistrar.safeTransferFrom(from, to, tokenId, data)
 *
 * `from` = ClassifiedName.tokenHolder (the BaseRegistrar ERC-721 owner)
 * `owner` in MigrationData = migrationOwner (the v2 destination address)
 */
export function buildUnwrappedCall(params: {
  name: ClassifiedName
  migrationOwner: Address
  defaultResolver: Address
}): UnwrappedMigrationCall {
  const { name, migrationOwner, defaultResolver } = params
  const tokenId = getTokenId(name)
  const target = getMigrationTarget(name.tokenType)
  const resolver = getResolverForName(name, defaultResolver)
  const data = encodeMigrationData(
    createMigrationData({ label: name.label, owner: migrationOwner, resolver }),
  )

  return {
    type: 'unwrapped',
    name,
    request: {
      address: V1_CONTRACTS.BaseRegistrar,
      abi: BASE_REGISTRAR_ABI,
      functionName: 'safeTransferFrom',
      args: [name.tokenHolder, target, tokenId, data] as const,
    },
  }
}

/**
 * Build a single ERC-1155 safeTransferFrom call for a wrapped name.
 * NameWrapper.safeTransferFrom(from, to, id, amount, data)
 *
 * `from` = ClassifiedName.tokenHolder (the NameWrapper ERC-1155 owner)
 * `owner` in MigrationData = migrationOwner (the v2 destination address)
 */
export function buildWrappedSingleCall(params: {
  name: ClassifiedName
  migrationOwner: Address
  defaultResolver: Address
  parentWrapperRegistry?: Address
}): WrappedSingleMigrationCall {
  const { name, migrationOwner, defaultResolver, parentWrapperRegistry } =
    params
  const tokenId = getTokenId(name)
  const target = getMigrationTarget(name.tokenType, parentWrapperRegistry)
  const resolver = getResolverForName(name, defaultResolver)
  const data = encodeMigrationData(
    createMigrationData({ label: name.label, owner: migrationOwner, resolver }),
  )

  return {
    type: 'wrapped-single',
    name,
    request: {
      address: V1_CONTRACTS.NameWrapper,
      abi: NAME_WRAPPER_ABI,
      functionName: 'safeTransferFrom',
      args: [name.tokenHolder, target, tokenId, 1n, data] as const,
    },
  }
}

/**
 * Build a batch ERC-1155 safeBatchTransferFrom call for multiple wrapped names.
 * NameWrapper.safeBatchTransferFrom(from, to, ids[], amounts[], data)
 *
 * All names in the batch must have the same tokenHolder (the `from` address)
 * and go to the same target controller.
 * Each name gets its own resolver based on CANNOT_SET_RESOLVER fuse.
 */
export function buildWrappedBatchCall(params: {
  names: ClassifiedName[]
  migrationOwner: Address
  defaultResolver: Address
  target: Address
}): WrappedBatchMigrationCall {
  const { names, migrationOwner, defaultResolver, target } = params

  // All names in a batch must have the same tokenHolder for the `from` param
  const tokenHolder = names[0]!.tokenHolder

  const tokenIds = names.map(getTokenId)
  const amounts = names.map(() => 1n)
  const migrationDataArray = names.map((name) => {
    const resolver = getResolverForName(name, defaultResolver)
    return createMigrationData({
      label: name.label,
      owner: migrationOwner,
      resolver,
    })
  })
  const data = encodeMigrationDataBatch(migrationDataArray)

  return {
    type: 'wrapped-batch',
    names,
    request: {
      address: V1_CONTRACTS.NameWrapper,
      abi: NAME_WRAPPER_ABI,
      functionName: 'safeBatchTransferFrom',
      args: [tokenHolder, target, tokenIds, amounts, data] as const,
    },
  }
}

/**
 * Build the optimal call(s) for a group of wrapped names going to the same target.
 * Uses batch transfer for 2+ names, single transfer for 1 name.
 */
export function buildWrappedCalls(params: {
  names: ClassifiedName[]
  migrationOwner: Address
  defaultResolver: Address
  target: Address
}): MigrationCall {
  const { names, migrationOwner, defaultResolver, target } = params

  if (names.length === 1 && names[0]) {
    return buildWrappedSingleCall({
      name: names[0],
      migrationOwner,
      defaultResolver,
      parentWrapperRegistry:
        names[0].tokenType === 'locked-child' ? target : undefined,
    })
  }

  return buildWrappedBatchCall({
    names,
    migrationOwner,
    defaultResolver,
    target,
  })
}
