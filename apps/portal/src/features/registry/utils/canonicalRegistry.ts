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

export type CanonicalRegistry = {
  /** Null when `getParent()` is unset: the root registry, or a registry nobody claimed. */
  readonly parent: CanonicalParent | null
  /**
   * The name spelled by following verified parent pointers up to the root,
   * e.g. "raffy.eth". Null when there is no parent, a hop fails verification,
   * or the chain does not reach the root within `MAX_DEPTH`.
   */
  readonly canonicalName: string | null
}

/** Deeper than any real name; also the cycle guard. */
export const MAX_DEPTH = 16

const isUnset = (parent: { registry: Address; label: string }) =>
  isAddressEqual(parent.registry, zeroAddress) || parent.label === ''

/**
 * Resolve a registry's canonical parent and, when every hop checks out, its
 * canonical name.
 *
 * The parent is a (registry, label) pair the registry itself declares via
 * `getParent()`. It is canonical only if the parent agrees: its
 * `getSubregistry(label)` must return this registry. Names that merely point
 * at a registry ("referenced by") are not parents.
 */
export async function resolveCanonicalRegistry(
  address: Address,
  reads: CanonicalRegistryReads,
): Promise<CanonicalRegistry> {
  const first = await reads.readParent(address)
  if (isUnset(first)) return { parent: null, canonicalName: null }

  const verified = isAddressEqual(
    await reads.readSubregistry(first.registry, first.label),
    address,
  )
  const parent: CanonicalParent = { ...first, verified }
  if (!verified) return { parent, canonicalName: null }

  const labels = [first.label]
  let child = first.registry
  for (let depth = 1; depth < MAX_DEPTH; depth++) {
    const next = await reads.readParent(child)
    if (isUnset(next)) return { parent, canonicalName: labels.join('.') }

    const ok = isAddressEqual(
      await reads.readSubregistry(next.registry, next.label),
      child,
    )
    if (!ok) return { parent, canonicalName: null }

    labels.push(next.label)
    child = next.registry
  }

  return { parent, canonicalName: null }
}
