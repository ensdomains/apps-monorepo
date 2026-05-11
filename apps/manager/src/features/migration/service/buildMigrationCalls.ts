import {
  type Address,
  encodeFunctionData,
  type Hex,
  toHex,
  zeroAddress,
} from 'viem'
import { packetToBytes } from 'viem/ens'
import { MIGRATION_HELPER_ABI } from '../contracts/abis'
import { V2_CONTRACTS } from '../contracts/addresses'
import type { ClassifiedName } from './classifyNames'
import { createMigrationData, type MigrationData } from './encodeMigration'

export type MigrationCall = {
  readonly to: Address
  readonly data: Hex
  readonly value: bigint
}

export type LockedChildrenPayload = {
  readonly parentName: Hex
  readonly groups: readonly (readonly MigrationData[])[]
}

export type MigrationHelperPayload = {
  readonly unwrapped: readonly MigrationData[]
  readonly unlockedGroups: readonly (readonly MigrationData[])[]
  readonly lockedGroups: readonly (readonly MigrationData[])[]
  readonly lockedChildrenGroups: readonly LockedChildrenPayload[]
}

export const emptyMigrationHelperPayload = (): MigrationHelperPayload => ({
  unwrapped: [],
  unlockedGroups: [],
  lockedGroups: [],
  lockedChildrenGroups: [],
})

const addressKey = (address: Address): string => address.toLowerCase()

const nameDepth = (name: string): number => name.split('.').length

const dnsPacketBytes = (name: string): Hex => toHex(packetToBytes(name))

export const resolverFor = (
  name: ClassifiedName,
  defaultResolver: Address,
  ownedPermRes: Address | null,
): Address => {
  const resolver: Address = (() => {
    switch (name.resolverStrategy) {
      case 'keep-v1':
        return (name.v1ResolverAddress ?? defaultResolver) as Address
      case 'to-owned-permres':
        return ownedPermRes ?? defaultResolver
    }
  })()
  if (resolver === zeroAddress) {
    throw new Error(
      `Resolver for "${name.domain.name}" resolved to the zero address (strategy=${name.resolverStrategy})`,
    )
  }
  return resolver
}

const migrationDataFor = (params: {
  name: ClassifiedName
  migrationOwner: Address
  defaultResolver: Address
  ownedPermRes: Address | null
}): MigrationData =>
  createMigrationData({
    label: params.name.label,
    owner: params.migrationOwner,
    resolver: resolverFor(
      params.name,
      params.defaultResolver,
      params.ownedPermRes,
    ),
  })

const groupWrappedByHolder = (params: {
  names: readonly ClassifiedName[]
  migrationOwner: Address
  defaultResolver: Address
  ownedPermRes: Address | null
}): MigrationData[][] => {
  const groups = new Map<string, MigrationData[]>()

  for (const name of params.names) {
    const key = addressKey(name.tokenHolder)
    const group = groups.get(key) ?? []
    group.push(migrationDataFor({ ...params, name }))
    groups.set(key, group)
  }

  return [...groups.values()]
}

export const buildMigrationHelperPayload = (params: {
  classified: readonly ClassifiedName[]
  migrationOwner: Address
  defaultResolver: Address
  ownedPermRes: Address | null
}): MigrationHelperPayload => {
  const unwrapped: MigrationData[] = []
  const unlocked: ClassifiedName[] = []
  const locked2ld: ClassifiedName[] = []
  const childrenByParent = new Map<string, ClassifiedName[]>()

  for (const name of params.classified) {
    switch (name.tokenType) {
      case 'unwrapped':
        unwrapped.push(migrationDataFor({ ...params, name }))
        break
      case 'unlocked':
        unlocked.push(name)
        break
      case 'locked-2ld':
        locked2ld.push(name)
        break
      case 'locked-child':
      case 'detached-child':
        if (!name.parentName) break
        childrenByParent.set(name.parentName, [
          ...(childrenByParent.get(name.parentName) ?? []),
          name,
        ])
        break
    }
  }

  const lockedChildrenGroups = [...childrenByParent.entries()]
    .sort(
      ([a], [b]) => nameDepth(a) - nameDepth(b) || a.localeCompare(b, 'en-US'),
    )
    .map(([parentName, names]) => ({
      parentName: dnsPacketBytes(parentName),
      groups: groupWrappedByHolder({ ...params, names }),
    }))

  return {
    unwrapped,
    unlockedGroups: groupWrappedByHolder({ ...params, names: unlocked }),
    lockedGroups: groupWrappedByHolder({ ...params, names: locked2ld }),
    lockedChildrenGroups,
  }
}

export const buildMigrationHelperCall = (
  payload: MigrationHelperPayload,
): MigrationCall => ({
  to: V2_CONTRACTS.MigrationHelper,
  data: encodeFunctionData({
    abi: MIGRATION_HELPER_ABI,
    functionName: 'migrate',
    args: [
      payload.unwrapped,
      payload.unlockedGroups,
      payload.lockedGroups,
      payload.lockedChildrenGroups,
    ],
  }),
  value: 0n,
})
