import { match } from 'ts-pattern'
import { type Address, encodeFunctionData, type Hex, multicall3Abi } from 'viem'

const MULTICALL3_ADDRESS: Address = '0xcA11bde05977b3631167028862bE2a173976CA11'

import { BASE_REGISTRAR_ABI, NAME_WRAPPER_ABI } from '../contracts/abis'
import { V1_CONTRACTS, V2_CONTRACTS } from '../contracts/addresses'
import { type ClassifiedName, FUSES, hasFuse } from './classifyNames'
import {
  createMigrationData,
  encodeMigrationData,
  encodeMigrationDataBatch,
} from './encodeMigration'

type UnwrappedMigrationCall = {
  readonly type: 'unwrapped'
  readonly name: ClassifiedName
  readonly request: {
    readonly address: Address
    readonly abi: typeof BASE_REGISTRAR_ABI
    readonly functionName: 'safeTransferFrom'
    readonly args: readonly [Address, Address, bigint, Hex]
  }
}

type WrappedSingleMigrationCall = {
  readonly type: 'wrapped-single'
  readonly name: ClassifiedName
  readonly request: {
    readonly address: Address
    readonly abi: typeof NAME_WRAPPER_ABI
    readonly functionName: 'safeTransferFrom'
    readonly args: readonly [Address, Address, bigint, bigint, Hex]
  }
}

type WrappedBatchMigrationCall = {
  readonly type: 'wrapped-batch'
  readonly names: readonly ClassifiedName[]
  readonly request: {
    readonly address: Address
    readonly abi: typeof NAME_WRAPPER_ABI
    readonly functionName: 'safeBatchTransferFrom'
    readonly args: readonly [Address, Address, bigint[], bigint[], Hex]
  }
}

export type WrappedMigrationCall =
  | WrappedSingleMigrationCall
  | WrappedBatchMigrationCall

const getTokenId = (name: ClassifiedName): bigint =>
  name.tokenType === 'unwrapped'
    ? BigInt(name.domain.labelhash)
    : BigInt(name.domain.id)

const getMigrationTarget = (
  tokenType: ClassifiedName['tokenType'],
  parentWrapperRegistry?: Address,
): Address =>
  match(tokenType)
    .with(
      'unwrapped',
      'unlocked',
      () => V2_CONTRACTS.UnlockedMigrationController,
    )
    .with('locked-2ld', () => V2_CONTRACTS.LockedMigrationController)
    .with('locked-child', 'detached-child', () => {
      if (!parentWrapperRegistry) {
        throw new Error(
          'Parent WrapperRegistry address required for child migration',
        )
      }
      return parentWrapperRegistry
    })
    .exhaustive()

const getResolverForName = (
  name: ClassifiedName,
  defaultResolver: Address,
): Address =>
  match(name.tokenType)
    .with('locked-2ld', 'locked-child', () => {
      if (
        hasFuse(name.fuses, FUSES.CANNOT_SET_RESOLVER) &&
        name.v1ResolverAddress
      ) {
        return name.v1ResolverAddress as Address
      }
      return defaultResolver
    })
    // Detached names are unwrapped to Graveyard — resolver is always cleared
    .with('detached-child', () => defaultResolver)
    .otherwise(() => defaultResolver)

export const buildUnwrappedCall = (params: {
  name: ClassifiedName
  migrationOwner: Address
  defaultResolver: Address
}): UnwrappedMigrationCall => {
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

const buildWrappedSingleCall = (params: {
  name: ClassifiedName
  migrationOwner: Address
  defaultResolver: Address
  parentWrapperRegistry?: Address
}): WrappedSingleMigrationCall => {
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

const buildWrappedBatchCall = (params: {
  names: readonly ClassifiedName[]
  migrationOwner: Address
  defaultResolver: Address
  target: Address
}): WrappedBatchMigrationCall => {
  const { names, migrationOwner, defaultResolver, target } = params

  const first = names[0]
  if (!first) throw new Error('Cannot build batch call with empty names array')

  const holders = new Set(names.map((n) => n.tokenHolder))
  if (holders.size > 1) {
    throw new Error(
      'Batch transfer requires all names to have the same token holder',
    )
  }

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
      args: [first.tokenHolder, target, tokenIds, amounts, data] as const,
    },
  }
}

export const buildWrappedCalls = (params: {
  names: readonly ClassifiedName[]
  migrationOwner: Address
  defaultResolver: Address
  target: Address
}): WrappedMigrationCall => {
  const { names, migrationOwner, defaultResolver, target } = params

  if (names.length === 1 && names[0]) {
    return buildWrappedSingleCall({
      name: names[0],
      migrationOwner,
      defaultResolver,
      parentWrapperRegistry:
        names[0].tokenType === 'locked-child' ||
        names[0].tokenType === 'detached-child'
          ? target
          : undefined,
    })
  }

  return buildWrappedBatchCall({
    names,
    migrationOwner,
    defaultResolver,
    target,
  })
}

export const buildUnwrappedMulticall = (params: {
  names: readonly ClassifiedName[]
  migrationOwner: Address
  defaultResolver: Address
}) => {
  const { names, migrationOwner, defaultResolver } = params

  const calls = names.map((name) => {
    const tokenId = getTokenId(name)
    const target = getMigrationTarget(name.tokenType)
    const resolver = getResolverForName(name, defaultResolver)
    const data = encodeMigrationData(
      createMigrationData({
        label: name.label,
        owner: migrationOwner,
        resolver,
      }),
    )

    return {
      target: V1_CONTRACTS.BaseRegistrar,
      allowFailure: false,
      callData: encodeFunctionData({
        abi: BASE_REGISTRAR_ABI,
        functionName: 'safeTransferFrom',
        args: [name.tokenHolder, target, tokenId, data],
      }),
    }
  })

  return {
    address: MULTICALL3_ADDRESS,
    abi: multicall3Abi,
    functionName: 'aggregate3' as const,
    args: [calls] as const,
  }
}
