import { type Address, isAddressEqual, zeroAddress } from 'viem'

/** How a registry's parent pointer is read; injected so the walk is testable. */
export type CanonicalRegistryReads = {
  /** `IRegistry.getParent()`: the parent registry and the label under it. */
  readonly readParent: (
    registry: Address,
  ) => Promise<{ readonly registry: Address; readonly label: string }>
  /** `IRegistry.getSubregistry(label)` on the parent. */
  readonly readSubregistry: (
    registry: Address,
    label: string,
  ) => Promise<Address>
}

export type CanonicalParent = {
  readonly registry: Address
  readonly label: string
  /** `parent.getSubregistry(label)` points back at this registry. */
  readonly verified: boolean
}

/** A DNS name is at most 255 bytes, so no real chain has this many labels. */
export const MAX_LABELS = 128

const isUnset = (parent: { registry: Address; label: string }) =>
  isAddressEqual(parent.registry, zeroAddress) || parent.label === ''

const pointsBack = async (
  reads: CanonicalRegistryReads,
  parent: { registry: Address; label: string },
  child: Address,
) =>
  isAddressEqual(
    await reads.readSubregistry(parent.registry, parent.label),
    child,
  )

/**
 * The parent a registry declares through `getParent()`, or null when unset
 * (the root registry, or a registry nobody claimed). The pair is canonical
 * only if the parent agrees, so `verified` reports whether its
 * `getSubregistry(label)` points back here. Names that merely point at a
 * registry ("referenced by") are not parents.
 */
export async function resolveCanonicalParent(
  address: Address,
  reads: CanonicalRegistryReads,
): Promise<CanonicalParent | null> {
  const parent = await reads.readParent(address)
  if (isUnset(parent)) return null
  return { ...parent, verified: await pointsBack(reads, parent, address) }
}

/**
 * The name a registry's parent chain spells, e.g. "raffy.eth", or null.
 *
 * Null unless every hop verifies and the chain ends at `root`, the
 * deployment's root registry. Ending anywhere else means the chain is
 * disconnected from the tree and the labels do not add up to a real name,
 * even though each hop may look consistent on its own.
 */
export async function resolveCanonicalName(
  address: Address,
  reads: CanonicalRegistryReads,
  root: Address,
): Promise<string | null> {
  const labels: string[] = []
  const visited = new Set<string>()
  let child = address

  while (labels.length < MAX_LABELS) {
    if (isAddressEqual(child, root)) {
      return labels.length > 0 ? labels.join('.') : null
    }
    visited.add(child.toLowerCase())

    const parent = await reads.readParent(child)
    if (isUnset(parent)) return null
    if (visited.has(parent.registry.toLowerCase())) return null
    if (!(await pointsBack(reads, parent, child))) return null

    labels.push(parent.label)
    child = parent.registry
  }

  return null
}
