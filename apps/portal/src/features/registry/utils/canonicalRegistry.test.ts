import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'
import {
  type CanonicalRegistryReads,
  MAX_DEPTH,
  resolveCanonicalRegistry,
} from './canonicalRegistry'

const ROOT = '0x1000000000000000000000000000000000000001' as Address
const ETH = '0x2000000000000000000000000000000000000002' as Address
const RAFFY = '0x3000000000000000000000000000000000000003' as Address
const OTHER = '0x4000000000000000000000000000000000000004' as Address
const ZERO = '0x0000000000000000000000000000000000000000' as Address

/** A registry tree: child -> (parent, label), and parent -> label -> child. */
const tree = (
  parents: Record<string, { registry: Address; label: string }>,
  subregistries: Record<string, Record<string, Address>>,
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
  },
  {
    [ROOT.toLowerCase()]: { eth: ETH },
    [ETH.toLowerCase()]: { raffy: RAFFY },
  },
)

describe('resolveCanonicalRegistry', () => {
  it('reports no parent for the root registry', async () => {
    expect(await resolveCanonicalRegistry(ROOT, consistent)).toEqual({
      parent: null,
      canonicalName: null,
    })
  })

  it('reports no parent for a registry nobody claimed', async () => {
    expect(await resolveCanonicalRegistry(OTHER, consistent)).toEqual({
      parent: null,
      canonicalName: null,
    })
  })

  it('verifies the parent and spells the canonical name to the root', async () => {
    expect(await resolveCanonicalRegistry(RAFFY, consistent)).toEqual({
      parent: { registry: ETH, label: 'raffy', verified: true },
      canonicalName: 'raffy.eth',
    })
    expect(await resolveCanonicalRegistry(ETH, consistent)).toEqual({
      parent: { registry: ROOT, label: 'eth', verified: true },
      canonicalName: 'eth',
    })
  })

  it('fails verification when the parent points elsewhere, and gives no name', async () => {
    const forked = tree(
      { [RAFFY.toLowerCase()]: { registry: ETH, label: 'raffy' } },
      { [ETH.toLowerCase()]: { raffy: OTHER } },
    )
    expect(await resolveCanonicalRegistry(RAFFY, forked)).toEqual({
      parent: { registry: ETH, label: 'raffy', verified: false },
      canonicalName: null,
    })
  })

  it('keeps the verified parent but drops the name when a higher hop fails', async () => {
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
    expect(await resolveCanonicalRegistry(RAFFY, brokenAbove)).toEqual({
      parent: { registry: ETH, label: 'raffy', verified: true },
      canonicalName: null,
    })
  })

  it('compares addresses case-insensitively', async () => {
    const lower = tree(
      { [RAFFY.toLowerCase()]: { registry: ETH, label: 'raffy' } },
      { [ETH.toLowerCase()]: { raffy: RAFFY.toLowerCase() as Address } },
    )
    const result = await resolveCanonicalRegistry(
      RAFFY.toUpperCase().replace('0X', '0x') as Address,
      lower,
    )
    expect(result.parent?.verified).toBe(true)
  })

  it('stops at MAX_DEPTH on a cycle instead of looping', async () => {
    let reads = 0
    const cyclic: CanonicalRegistryReads = {
      readParent: async (registry) => {
        reads++
        return { registry: registry === ETH ? RAFFY : ETH, label: 'x' }
      },
      readSubregistry: async (registry) => (registry === ETH ? RAFFY : ETH),
    }
    expect(await resolveCanonicalRegistry(RAFFY, cyclic)).toEqual({
      parent: { registry: ETH, label: 'x', verified: true },
      canonicalName: null,
    })
    expect(reads).toBeLessThanOrEqual(MAX_DEPTH)
  })
})
