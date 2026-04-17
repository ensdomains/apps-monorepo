import type { ZeroDevCall } from '@ens-apps/transaction-manager'
import { type Address, encodeFunctionData } from 'viem'
import { BASE_REGISTRAR_ABI, NAME_WRAPPER_ABI } from '../contracts/abis'
import { V1_CONTRACTS, V2_CONTRACTS } from '../contracts/addresses'
import type { ClassifiedName } from './classifyNames'
import { createMigrationData, encodeMigrationData } from './encodeMigration'

const getTokenId = (name: ClassifiedName): bigint =>
  name.tokenType === 'unwrapped'
    ? BigInt(name.domain.labelhash)
    : BigInt(name.domain.id)

const resolverFor = (
  name: ClassifiedName,
  defaultResolver: Address,
  ownedPermRes: Address | null,
): Address => {
  if (name.preservedResolver) return name.preservedResolver
  if (ownedPermRes) return ownedPermRes
  return defaultResolver
}

export const buildUnwrappedTransferCall = (params: {
  name: ClassifiedName
  migrationOwner: Address
  defaultResolver: Address
  ownedPermRes: Address | null
}): ZeroDevCall => {
  const { name, migrationOwner, defaultResolver, ownedPermRes } = params
  const migrationData = encodeMigrationData(
    createMigrationData({
      label: name.label,
      owner: migrationOwner,
      resolver: resolverFor(name, defaultResolver, ownedPermRes),
    }),
  )

  return {
    to: V1_CONTRACTS.BaseRegistrar,
    data: encodeFunctionData({
      abi: BASE_REGISTRAR_ABI,
      functionName: 'safeTransferFrom',
      args: [
        name.tokenHolder,
        V2_CONTRACTS.UnlockedMigrationController,
        getTokenId(name),
        migrationData,
      ],
    }),
    value: 0n,
  }
}

export const buildWrappedTransferCall = (params: {
  name: ClassifiedName
  migrationOwner: Address
  defaultResolver: Address
  ownedPermRes: Address | null
  target: Address
}): ZeroDevCall => {
  const { name, migrationOwner, defaultResolver, ownedPermRes, target } = params
  const migrationData = encodeMigrationData(
    createMigrationData({
      label: name.label,
      owner: migrationOwner,
      resolver: resolverFor(name, defaultResolver, ownedPermRes),
    }),
  )

  return {
    to: V1_CONTRACTS.NameWrapper,
    data: encodeFunctionData({
      abi: NAME_WRAPPER_ABI,
      functionName: 'safeTransferFrom',
      args: [name.tokenHolder, target, getTokenId(name), 1n, migrationData],
    }),
    value: 0n,
  }
}

export const buildAllTransferCalls = (params: {
  classified: readonly ClassifiedName[]
  migrationOwner: Address
  defaultResolver: Address
  ownedPermRes: Address | null
  parentRegistries: ReadonlyMap<string, Address>
}): ZeroDevCall[] => {
  const {
    classified,
    migrationOwner,
    defaultResolver,
    ownedPermRes,
    parentRegistries,
  } = params
  const calls: ZeroDevCall[] = []

  for (const name of classified) {
    switch (name.tokenType) {
      case 'unwrapped':
        calls.push(
          buildUnwrappedTransferCall({
            name,
            migrationOwner,
            defaultResolver,
            ownedPermRes,
          }),
        )
        break
      case 'unlocked':
        calls.push(
          buildWrappedTransferCall({
            name,
            migrationOwner,
            defaultResolver,
            ownedPermRes,
            target: V2_CONTRACTS.UnlockedMigrationController,
          }),
        )
        break
      case 'locked-2ld':
        calls.push(
          buildWrappedTransferCall({
            name,
            migrationOwner,
            defaultResolver,
            ownedPermRes,
            target: V2_CONTRACTS.LockedMigrationController,
          }),
        )
        break
      case 'locked-child':
      case 'detached-child': {
        const parentRegistry = name.parentName
          ? parentRegistries.get(name.parentName)
          : undefined
        if (!parentRegistry) {
          throw new Error(`Parent registry not found for "${name.domain.name}"`)
        }
        calls.push(
          buildWrappedTransferCall({
            name,
            migrationOwner,
            defaultResolver,
            ownedPermRes,
            target: parentRegistry,
          }),
        )
        break
      }
    }
  }

  return calls
}
