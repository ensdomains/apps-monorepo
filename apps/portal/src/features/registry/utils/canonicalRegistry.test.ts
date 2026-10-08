import { type Address, type Client, zeroAddress } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('viem/actions', () => ({ readContract: vi.fn() }))

import { readContract } from 'viem/actions'
import { resolveCanonicalRegistry } from './canonicalRegistry'

const ROOT = '0x1000000000000000000000000000000000000001'
const ETH = '0x2000000000000000000000000000000000000002'
const RAFFY = '0x3000000000000000000000000000000000000003'
const OTHER = '0x4000000000000000000000000000000000000004'
const ISLAND = '0x5000000000000000000000000000000000000005'

const client = {} as Client

type Parent = { readonly registry: Address; readonly label: string }

/** The subset of readContract's parameters the fakes need. */
type ReadParams = {
  readonly address: Address
  readonly functionName: string
  readonly args?: readonly unknown[]
}

/**
 * Answer `getParent` / `getSubregistry` from a registry tree: child -> (parent,
 * label), and parent -> label -> child. Unknown registries have no parent and
 * no subregistries.
 */
const useTree = (
  parents: Readonly<Record<string, Parent>>,
  subregistries: Readonly<Record<string, Readonly<Record<string, Address>>>>,
) => {
  vi.mocked(readContract).mockImplementation(async (_client, params) => {
    const { address, functionName, args } = params as ReadParams
    const registry = address.toLowerCase()
    if (functionName === 'getParent') {
      const parent = parents[registry] ?? { registry: zeroAddress, label: '' }
      return [parent.registry, parent.label]
    }
    const [label] = args as readonly [string]
    return subregistries[registry]?.[label] ?? zeroAddress
  })
}

const consistent = () =>
  useTree(
    {
      [ETH.toLowerCase()]: { registry: ROOT, label: 'eth' },
      [RAFFY.toLowerCase()]: { registry: ETH, label: 'raffy' },
      // Verified hop into a registry that is neither the root nor parented.
      [OTHER.toLowerCase()]: { registry: ISLAND, label: 'x' },
    },
    {
      [ROOT.toLowerCase()]: { eth: ETH },
      [ETH.toLowerCase()]: { raffy: RAFFY },
      [ISLAND.toLowerCase()]: { x: OTHER },
    },
  )

const resolve = (address: Address) =>
  resolveCanonicalRegistry(client, { address, root: ROOT })

describe('resolveCanonicalRegistry', () => {
  beforeEach(() => {
    vi.mocked(readContract).mockReset()
  })

  it('has no parent for the root and for a registry nobody claimed', async () => {
    consistent()
    for (const address of [ROOT, ISLAND] as const) {
      expect(await resolve(address)).toEqual({
        parent: null,
        name: { status: 'none' },
      })
    }
  })

  it('verifies the parent and spells the name up to the root', async () => {
    consistent()
    expect(await resolve(RAFFY)).toEqual({
      parent: { registry: ETH, label: 'raffy', verified: true },
      name: { status: 'resolved', value: 'raffy.eth' },
    })
    expect(await resolve(ETH)).toEqual({
      parent: { registry: ROOT, label: 'eth', verified: true },
      name: { status: 'resolved', value: 'eth' },
    })
  })

  it('marks the pair unverified when the parent points elsewhere, with no name', async () => {
    useTree(
      { [RAFFY.toLowerCase()]: { registry: ETH, label: 'raffy' } },
      { [ETH.toLowerCase()]: { raffy: OTHER } },
    )
    expect(await resolve(RAFFY)).toEqual({
      parent: { registry: ETH, label: 'raffy', verified: false },
      name: { status: 'none' },
    })
  })

  it('gives no name when the chain ends at an unparented registry that is not the root', async () => {
    consistent()
    expect(await resolve(OTHER)).toEqual({
      parent: { registry: ISLAND, label: 'x', verified: true },
      name: { status: 'none' },
    })
  })

  it('keeps the parent and gives no name when a higher hop fails verification', async () => {
    useTree(
      {
        [ETH.toLowerCase()]: { registry: ROOT, label: 'eth' },
        [RAFFY.toLowerCase()]: { registry: ETH, label: 'raffy' },
      },
      {
        [ROOT.toLowerCase()]: { eth: OTHER },
        [ETH.toLowerCase()]: { raffy: RAFFY },
      },
    )
    expect(await resolve(RAFFY)).toEqual({
      parent: { registry: ETH, label: 'raffy', verified: true },
      name: { status: 'none' },
    })
  })

  it('reports the name unavailable, not absent, when a read above the first hop fails', async () => {
    consistent()
    const tree = vi.mocked(readContract).getMockImplementation()
    vi.mocked(readContract).mockImplementation(async (c, params) => {
      const { address, functionName } = params as ReadParams
      if (
        address.toLowerCase() === ETH.toLowerCase() &&
        functionName === 'getParent'
      ) {
        throw new Error('rpc down')
      }
      return tree?.(c, params)
    })
    expect(await resolve(RAFFY)).toEqual({
      parent: { registry: ETH, label: 'raffy', verified: true },
      name: { status: 'unavailable' },
    })
  })

  it('throws when the first hop itself cannot be read', async () => {
    vi.mocked(readContract).mockRejectedValue(new Error('rpc down'))
    await expect(resolve(RAFFY)).rejects.toThrow('rpc down')
  })

  it('compares addresses case-insensitively', async () => {
    useTree(
      { [RAFFY.toLowerCase()]: { registry: ETH, label: 'raffy' } },
      { [ETH.toLowerCase()]: { raffy: RAFFY.toLowerCase() as Address } },
    )
    const upper = RAFFY.toUpperCase().replace('0X', '0x') as Address
    expect((await resolve(upper)).parent?.verified).toBe(true)
  })

  it('resolves deep chains and stops on a cycle without looping', async () => {
    const depth = 40
    const at = (i: number) =>
      `0x${(i + 1).toString(16).padStart(40, '0')}` as Address
    const parents: Record<string, Parent> = {}
    const subs: Record<string, Record<string, Address>> = {}
    for (let i = 0; i < depth; i++) {
      const parent = i === depth - 1 ? ROOT : at(i + 1)
      parents[at(i).toLowerCase()] = { registry: parent, label: `l${i}` }
      subs[parent.toLowerCase()] = { [`l${i}`]: at(i) }
    }
    useTree(parents, subs)
    const deep = await resolve(at(0))
    expect(deep.name.status).toBe('resolved')
    if (deep.name.status === 'resolved') {
      expect(deep.name.value.split('.')).toHaveLength(depth)
    }

    useTree(
      {
        [RAFFY.toLowerCase()]: { registry: ETH, label: 'a' },
        [ETH.toLowerCase()]: { registry: RAFFY, label: 'b' },
      },
      {
        [ETH.toLowerCase()]: { a: RAFFY },
        [RAFFY.toLowerCase()]: { b: ETH },
      },
    )
    vi.mocked(readContract).mockClear()
    expect(await resolve(RAFFY)).toEqual({
      parent: { registry: ETH, label: 'a', verified: true },
      name: { status: 'none' },
    })
    expect(vi.mocked(readContract).mock.calls.length).toBeLessThanOrEqual(6)
  })
})
