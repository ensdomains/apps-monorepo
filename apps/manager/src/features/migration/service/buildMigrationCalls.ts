import { type Address, encodeFunctionData, type Hex, multicall3Abi } from 'viem'
import { BASE_REGISTRAR_ABI, NAME_WRAPPER_ABI } from '../contracts/abis'
import {
  MULTICALL3_ADDRESS,
  V1_CONTRACTS,
  V2_CONTRACTS,
} from '../contracts/addresses'
import type { ClassifiedName } from './classifyNames'
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

const getTokenId = (name: ClassifiedName): bigint =>
  name.tokenType === 'unwrapped'
    ? BigInt(name.domain.labelhash)
    : BigInt(name.domain.id)

const resolverFor = (name: ClassifiedName, defaultResolver: Address): Address =>
  name.preservedResolver ?? defaultResolver

export const buildUnwrappedCall = (params: {
  name: ClassifiedName
  migrationOwner: Address
  defaultResolver: Address
}): UnwrappedMigrationCall => {
  const { name, migrationOwner, defaultResolver } = params
  const data = encodeMigrationData(
    createMigrationData({
      label: name.label,
      owner: migrationOwner,
      resolver: resolverFor(name, defaultResolver),
    }),
  )

  return {
    type: 'unwrapped',
    name,
    request: {
      address: V1_CONTRACTS.BaseRegistrar,
      abi: BASE_REGISTRAR_ABI,
      functionName: 'safeTransferFrom',
      args: [
        name.tokenHolder,
        V2_CONTRACTS.UnlockedMigrationController,
        getTokenId(name),
        data,
      ] as const,
    },
  }
}

export const buildWrappedSingleCall = (params: {
  name: ClassifiedName
  migrationOwner: Address
  defaultResolver: Address
  target: Address
}): WrappedSingleMigrationCall => {
  const { name, migrationOwner, defaultResolver, target } = params
  const data = encodeMigrationData(
    createMigrationData({
      label: name.label,
      owner: migrationOwner,
      resolver: resolverFor(name, defaultResolver),
    }),
  )

  return {
    type: 'wrapped-single',
    name,
    request: {
      address: V1_CONTRACTS.NameWrapper,
      abi: NAME_WRAPPER_ABI,
      functionName: 'safeTransferFrom',
      args: [name.tokenHolder, target, getTokenId(name), 1n, data] as const,
    },
  }
}

export const buildWrappedBatchCall = (params: {
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

  const migrationDataArray = names.map((name) =>
    createMigrationData({
      label: name.label,
      owner: migrationOwner,
      resolver: resolverFor(name, defaultResolver),
    }),
  )

  return {
    type: 'wrapped-batch',
    names,
    request: {
      address: V1_CONTRACTS.NameWrapper,
      abi: NAME_WRAPPER_ABI,
      functionName: 'safeBatchTransferFrom',
      args: [
        first.tokenHolder,
        target,
        names.map(getTokenId),
        names.map(() => 1n),
        encodeMigrationDataBatch(migrationDataArray),
      ] as const,
    },
  }
}

export const buildUnwrappedMulticall = (params: {
  names: readonly ClassifiedName[]
  migrationOwner: Address
  defaultResolver: Address
}) => {
  const { names, migrationOwner, defaultResolver } = params

  const calls = names.map((name) => {
    const data = encodeMigrationData(
      createMigrationData({
        label: name.label,
        owner: migrationOwner,
        resolver: resolverFor(name, defaultResolver),
      }),
    )

    return {
      target: V1_CONTRACTS.BaseRegistrar,
      allowFailure: false,
      callData: encodeFunctionData({
        abi: BASE_REGISTRAR_ABI,
        functionName: 'safeTransferFrom',
        args: [
          name.tokenHolder,
          V2_CONTRACTS.UnlockedMigrationController,
          getTokenId(name),
          data,
        ],
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
