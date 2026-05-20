import type { Erc4337Call } from '@ens-apps/transaction-manager'
import { type Address, encodeFunctionData, type Hex, zeroAddress } from 'viem'
import { MIGRATION_HELPER_ABI } from '../contracts/abis'
import { V2_CONTRACTS } from '../contracts/addresses'
import { dnsEncodeName } from '../utils/dnsEncodeName'
import type { ClassifiedName } from './classifyNames'
import {
  createMigrationData,
  type MigrationData,
  resolverFor,
} from './encodeMigration'

type BuildMigrateCallParams = {
  readonly classified: readonly ClassifiedName[]
  readonly migrationOwner: Address
  readonly defaultResolver: Address
  readonly ownedPermRes: Address | null
}

const toData = (
  name: ClassifiedName,
  migrationOwner: Address,
  defaultResolver: Address,
  ownedPermRes: Address | null,
): MigrationData =>
  createMigrationData({
    label: name.label,
    owner: migrationOwner,
    resolver: resolverFor(name, defaultResolver, ownedPermRes),
    subregistry: zeroAddress,
  })

type LockedChildren = {
  readonly parentName: Hex
  readonly groups: readonly (readonly MigrationData[])[]
}

export const buildMigrateCall = ({
  classified,
  migrationOwner,
  defaultResolver,
  ownedPermRes,
}: BuildMigrateCallParams): Erc4337Call => {
  const unwrapped: MigrationData[] = []
  const unlocked: MigrationData[] = []
  const locked2ld: MigrationData[] = []
  const childrenByParent = new Map<string, MigrationData[]>()

  for (const name of classified) {
    const data = toData(name, migrationOwner, defaultResolver, ownedPermRes)
    switch (name.tokenType) {
      case 'unwrapped':
        unwrapped.push(data)
        break
      case 'unlocked':
        unlocked.push(data)
        break
      case 'locked-2ld':
        locked2ld.push(data)
        break
      case 'locked-child':
      case 'detached-child': {
        const parent = name.parentName
        if (!parent) {
          throw new Error(
            `Locked child "${name.domain.name}" has no parent name`,
          )
        }
        const list = childrenByParent.get(parent) ?? []
        list.push(data)
        childrenByParent.set(parent, list)
        break
      }
    }
  }

  const lockedChildrenGroups: LockedChildren[] = [
    ...childrenByParent.entries(),
  ].map(([parentName, children]) => ({
    parentName: dnsEncodeName(parentName),
    groups: [children],
  }))

  return {
    to: V2_CONTRACTS.MigrationHelper,
    data: encodeFunctionData({
      abi: MIGRATION_HELPER_ABI,
      functionName: 'migrate',
      args: [
        unwrapped,
        unlocked.length > 0 ? [unlocked] : [],
        locked2ld.length > 0 ? [locked2ld] : [],
        lockedChildrenGroups,
      ],
    }),
    value: 0n,
  }
}
