import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'
import {
  type CanonicalRegistryReads,
  resolveCanonicalName,
  resolveCanonicalParent,
} from './canonicalRegistry'

const ROOT = '0x1000000000000000000000000000000000000001' as Address
const ETH = '0x2000000000000000000000000000000000000002' as Address
const RAFFY = '0x3000000000000000000000000000000000000003' as Address
const OTHER = '0x4000000000000000000000000000000000000004' as Address
const ISLAND = '0x5000000000000000000000000000000000000005' as Address
const ZERO = '0x0000000000000000000000000000000000000000' as Address

type Parent = { readonly registry: Address; readonly label: string }

/** A registry tree: child -> (parent, label), and parent -> label -> child. */
const tree = (
  parents: Readonly<Record<string, Parent>>,
  subregistries: Readonly<Record<string, Readonly<Record<string, Address>>>>,
): CanonicalRegistryReads => ({
  readParent: async (registry) =>
    parents[registry.toLowerCase()] ?? { registry: ZERO, label: '' },
  readSubregistry: async (registry, label) =>
    subregistries[registry.toLowerCase()]?.[label] ?? ZERO,
})

const consistent = tree(
  {
    [ETH.toLowerCase()]: { registry: ROOT, label: 'eth' },
    [RAFFY.toLowerCase()]: { registry: ETH, label: 'raffy' },
    // A registry whose parent is not in the tree: consistent hop, no root.
    [OTHER.toLowerCase()]: { registry: ISLAND, label: 'x' },
  },
  {
    [ROOT.toLowerCase()]: { eth: ETH },
    [ETH.toLowerCase()]: { raffy: RAFFY },
    [ISLAND.toLowerCase()]: { x: OTHER },
  },
)

describe('resolveCanonicalParent', () => {
  it('is null for the root and for a registry nobody claimed', async () => {
    expect(await resolveCanonicalParent(ROOT, consistent)).toBeNull()
    expect(await resolveCanonicalParent(ISLAND, consistent)).toBeNull()
  })

  it('returns the declared pair, verified when the parent points back', async () => {
    expect(await resolveCanonicalParent(RAFFY, consistent)).toEqual({
      registry: ETH,
      label: 'raffy',
      verified: true,
    })
  })

  it('marks the pair unverified when the parent points elsewhere', async () => {
    const forked = tree(
      { [RAFFY.toLowerCase()]: { registry: ETH, label: 'raffy' } },
      { [ETH.toLowerCase()]: { raffy: OTHER } },
    )
    expect(await resolveCanonicalParent(RAFFY, forked)).toEqual({
      registry: ETH,
      label: 'raffy',
      verified: false,
    })
  })

  it('compares addresses case-insensitively', async () => {
    const lower = tree(
      { [RAFFY.toLowerCase()]: { registry: ETH, label: 'raffy' } },
      { [ETH.toLowerCase()]: { raffy: RAFFY.toLowerCase() as Address } },
    )
    const upper = RAFFY.toUpperCase().replace('0X', '0x') as Address
    expect((await resolveCanonicalParent(upper, lower))?.verified).toBe(true)
  })
})

describe('resolveCanonicalName', () => {
  it('spells the name by walking verified parents to the root', async () => {
    expect(await resolveCanonicalName(RAFFY, consistent, ROOT)).toBe(
      'raffy.eth',
    )
    expect(await resolveCanonicalName(ETH, consistent, ROOT)).toBe('eth')
  })

  it('is null for the root itself and for an unclaimed registry', async () => {
    expect(await resolveCanonicalName(ROOT, consistent, ROOT)).toBeNull()
    expect(await resolveCanonicalName(ISLAND, consistent, ROOT)).toBeNull()
  })

  it('is null when the chain ends at an unset parent that is not the root', async () => {
    // OTHER -> ISLAND verifies, but ISLAND has no parent and is not the root.
    expect(await resolveCanonicalName(OTHER, consistent, ROOT)).toBeNull()
  })

  it('is null when any hop fails verification', async () => {
    const brokenAbove = tree(
      {
        [ETH.toLowerCase()]: { registry: ROOT, label: 'eth' },
        [RAFFY.toLowerCase()]: { registry: ETH, label: 'raffy' },
      },
      {
        [ROOT.toLowerCase()]: { eth: OTHER },
        [ETH.toLowerCase()]: { raffy: RAFFY },
      },
    )
    expect(await resolveCanonicalName(RAFFY, brokenAbove, ROOT)).toBeNull()
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
    const deep = tree(parents, subs)
    const name = await resolveCanonicalName(at(0), deep, ROOT)
    expect(name?.split('.')).toHaveLength(depth)

    let reads = 0
    const cyclic: CanonicalRegistryReads = {
      readParent: async (registry) => {
        reads++
        return { registry: registry === ETH ? RAFFY : ETH, label: 'x' }
      },
      readSubregistry: async (registry) => (registry === ETH ? RAFFY : ETH),
    }
    expect(await resolveCanonicalName(RAFFY, cyclic, ROOT)).toBeNull()
    expect(reads).toBeLessThanOrEqual(3)
  })
})
