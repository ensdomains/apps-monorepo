import { type Address, isAddressEqual } from 'viem'
import type { RegistryRepairName } from './registryRepairState'

/** `move`: the account re-parents it onto the replacement; `leave`: it stays on the old parent (no role, or its parent couldn't be read); `skip`: it already belongs elsewhere. */
export type RegistryChildAction = 'move' | 'leave' | 'skip'

/** A registry nested under one of the copied names. */
export type RegistryChild = {
  readonly label: string
  readonly registry: Address
  readonly action: RegistryChildAction
}

export type RegistryChildEntry = {
  /** A copied name with a subregistry. */
  readonly name: RegistryRepairName
  /** The subregistry's `getParent`, or null when it couldn't be read. */
  readonly parent: readonly [Address, string] | null
  /** The account holds `ROLE_SET_PARENT` on the subregistry. */
  readonly canSetParent: boolean
}

const childAction = (
  { name, parent, canSetParent }: RegistryChildEntry,
  fromRegistries: readonly Address[],
): RegistryChildAction => {
  if (parent === null) return 'leave'
  const [registry, label] = parent
  const isOnOldParent =
    label === name.label &&
    fromRegistries.some((from) => isAddressEqual(from, registry))
  if (!isOnOldParent) return 'skip'
  return canSetParent ? 'move' : 'leave'
}

/** What happens to each child registry; `fromRegistries` is the registry being upgraded plus any replacement an earlier attempt abandoned. */
export const toRegistryChildren = ({
  fromRegistries,
  entries,
}: {
  readonly fromRegistries: readonly Address[]
  readonly entries: readonly RegistryChildEntry[]
}): readonly RegistryChild[] =>
  entries.map((entry) => ({
    label: entry.name.label,
    registry: entry.name.subregistry,
    action: childAction(entry, fromRegistries),
  }))
