import { registryGetSubregistrySnippet } from '@ensdomains/ensjs-abi/registry'
import {
  type Address,
  type Client,
  isAddressEqual,
  parseAbi,
  zeroAddress,
} from 'viem'
import { readContract } from 'viem/actions'

const registryGetParentAbi = parseAbi([
  'function getParent() view returns (address registry, string label)',
])

export type CanonicalParent = {
  readonly registry: Address
  readonly label: string
  /** `parent.getSubregistry(label)` points back at this registry. */
  readonly verified: boolean
}

export type CanonicalName =
  /** Every hop verified and the chain ended at the root. */
  | { readonly status: 'resolved'; readonly value: string }
  /** No parent, an unverified hop, or a chain that never reaches the root. */
  | { readonly status: 'none' }
  /** A read above the first hop failed, so nothing can be said either way. */
  | { readonly status: 'unavailable' }

export type CanonicalRegistry = {
  /** Null when `getParent()` is unset: the root registry, or a registry nobody claimed. */
  readonly parent: CanonicalParent | null
  readonly name: CanonicalName
}

/** A DNS name is at most 255 bytes, so no real chain has this many labels. */
const MAX_LABELS = 128

type Parent = { readonly registry: Address; readonly label: string }

const readParent = async (
  client: Client,
  registry: Address,
): Promise<Parent> => {
  const [parent, label] = await readContract(client, {
    address: registry,
    abi: registryGetParentAbi,
    functionName: 'getParent',
  })
  return { registry: parent, label }
}

const pointsBack = async (client: Client, parent: Parent, child: Address) =>
  isAddressEqual(
    await readContract(client, {
      address: parent.registry,
      abi: registryGetSubregistrySnippet,
      functionName: 'getSubregistry',
      args: [parent.label],
    }),
    child,
  )

const isUnset = (parent: Parent) =>
  isAddressEqual(parent.registry, zeroAddress) || parent.label === ''

/**
 * Walk a registry's declared parents.
 *
 * The parent is what the registry itself declares through `getParent()`, an
 * optional (registry, label) pair; it is canonical only if the parent agrees,
 * so `verified` reports whether its `getSubregistry(label)` points back.
 * Names that merely point at a registry ("referenced by") are not parents.
 *
 * The name is spelled by the labels along the way, and only counts when every
 * hop verifies and the chain ends at `root`, the deployment's root registry.
 * Ending anywhere else means the chain is disconnected from the tree.
 *
 * The first hop's reads throw like any query; a failure higher up leaves the
 * parent intact and reports the name as unavailable rather than absent.
 */
export async function resolveCanonicalRegistry(
  client: Client,
  { address, root }: { readonly address: Address; readonly root: Address },
): Promise<CanonicalRegistry> {
  const first = await readParent(client, address)
  if (isUnset(first)) return { parent: null, name: { status: 'none' } }

  const verified = await pointsBack(client, first, address)
  const parent: CanonicalParent = { ...first, verified }
  if (!verified) return { parent, name: { status: 'none' } }

  try {
    const labels = [first.label]
    const visited = new Set([address.toLowerCase()])
    let child = first.registry

    while (labels.length < MAX_LABELS) {
      if (isAddressEqual(child, root)) {
        return { parent, name: { status: 'resolved', value: labels.join('.') } }
      }
      if (visited.has(child.toLowerCase())) break
      visited.add(child.toLowerCase())

      const next = await readParent(client, child)
      if (isUnset(next) || !(await pointsBack(client, next, child))) break

      labels.push(next.label)
      child = next.registry
    }
    return { parent, name: { status: 'none' } }
  } catch {
    return { parent, name: { status: 'unavailable' } }
  }
}
