import type { Address, PublicClient } from 'viem'
import { describe, expect, it, vi } from 'vitest'
import {
  buildBatchedMigrateCalls,
  partitionForMigrate,
  verifyOrSplit,
} from './batchMigrate'
import {
  GAS_HEURISTIC,
  MAX_NAMES_HINT,
  PER_BATCH_OVERHEAD,
  TARGET_GAS,
} from './batchMigrate.constants'
import type { ClassifiedName, MigrationTokenType } from './classifyNames'

const owner = '0x0000000000000000000000000000000000000001' as Address

const makeName = (
  name: string,
  tokenType: MigrationTokenType,
  parentName: string | null = null,
): ClassifiedName => ({
  domain: { name, labelName: name.split('.')[0]!, parent: null } as never,
  tokenType,
  label: name.split('.')[0]!,
  parentName,
  fuses: 0,
  tokenHolder: owner,
  v1ResolverAddress: null,
  resolverStrategy: 'to-owned-permres',
  managerAddress: null,
})

const defaultOpts = {
  maxNamesHint: MAX_NAMES_HINT,
  targetGas: TARGET_GAS,
  perBatchOverhead: PER_BATCH_OVERHEAD,
  gasHeuristic: GAS_HEURISTIC,
}

describe('partitionForMigrate', () => {
  it('returns empty array for empty input', () => {
    expect(partitionForMigrate([], defaultOpts)).toEqual([])
  })

  it('packs 50 unwrapped names into a single batch', () => {
    const names = Array.from({ length: 50 }, (_, i) =>
      makeName(`name${i}.eth`, 'unwrapped'),
    )
    const batches = partitionForMigrate(names, defaultOpts)
    expect(batches).toHaveLength(1)
    expect(batches[0]).toHaveLength(50)
  })

  it('splits 250 unwrapped names into 100/100/50 by MAX_NAMES_HINT', () => {
    const names = Array.from({ length: 250 }, (_, i) =>
      makeName(`name${i}.eth`, 'unwrapped'),
    )
    const batches = partitionForMigrate(names, defaultOpts)
    expect(batches.map((b) => b.length)).toEqual([100, 100, 50])
  })

  it('keeps parent and its locked children together when they fit', () => {
    const parent = makeName('parent.eth', 'locked-2ld')
    const children = Array.from({ length: 5 }, (_, i) =>
      makeName(`c${i}.parent.eth`, 'locked-child', 'parent.eth'),
    )
    const batches = partitionForMigrate(
      [...children, parent], // intentionally jumbled
      defaultOpts,
    )
    expect(batches).toHaveLength(1)
    expect(batches[0]!.map((n) => n.domain.name)).toContain('parent.eth')
    expect(batches[0]!.findIndex((n) => n.domain.name === 'parent.eth')).toBe(0)
  })

  it('splits parent + 250 children: parent in batch 1, remaining children after', () => {
    const parent = makeName('parent.eth', 'locked-2ld')
    const children = Array.from({ length: 250 }, (_, i) =>
      makeName(`c${i}.parent.eth`, 'locked-child', 'parent.eth'),
    )
    const batches = partitionForMigrate([parent, ...children], defaultOpts)
    expect(batches[0]![0]!.domain.name).toBe('parent.eth')
    expect(batches[0]!.length).toBe(100) // parent + 99 children
    expect(batches.flat()).toHaveLength(251)
  })

  it('caps batch by gas budget when heuristic exceeds target before count cap', () => {
    const names = Array.from({ length: 200 }, (_, i) =>
      makeName(`name${i}.eth`, 'locked-2ld'),
    )
    const tightOpts = { ...defaultOpts, targetGas: 1_000_000n }
    const batches = partitionForMigrate(names, tightOpts)
    // locked-2ld heuristic = 240_000n; overhead = 80_000n.
    // (1_000_000 - 80_000) / 240_000 = 3.83 → 3 per batch.
    expect(batches[0]!.length).toBeLessThanOrEqual(4)
    expect(batches.flat()).toHaveLength(200)
  })
})

describe('buildBatchedMigrateCalls', () => {
  it('returns empty calls + batches for empty classified', () => {
    const out = buildBatchedMigrateCalls({
      classified: [],
      migrationOwner: owner,
      defaultResolver: '0x0000000000000000000000000000000000000002' as Address,
      ownedPermRes: null,
    })
    expect(out.calls).toEqual([])
    expect(out.batches).toEqual([])
  })

  it('emits one Erc4337Call per batch with matching MigrationBatch metadata', () => {
    const names = Array.from({ length: 150 }, (_, i) =>
      makeName(`name${i}.eth`, 'unwrapped'),
    )
    const out = buildBatchedMigrateCalls({
      classified: names,
      migrationOwner: owner,
      defaultResolver: '0x0000000000000000000000000000000000000002' as Address,
      ownedPermRes: null,
    })
    expect(out.calls).toHaveLength(2)
    expect(out.batches).toHaveLength(2)
    expect(out.batches[0]!.index).toBe(0)
    expect(out.batches[1]!.index).toBe(1)
    expect(out.batches[0]!.names).toHaveLength(100)
    expect(out.batches[1]!.names).toHaveLength(50)
    expect(out.batches[0]!.estimatedGas).toBeGreaterThan(0n)
    for (const c of out.calls) {
      expect(c.to).toMatch(/^0x/)
      expect(c.data.startsWith('0x')).toBe(true)
      expect(c.value).toBe(0n)
    }
  })
})

const makePublicClient = (estimates: bigint[]): PublicClient => {
  const fn = vi.fn()
  for (const v of estimates) fn.mockResolvedValueOnce(v)
  return { estimateGas: fn } as unknown as PublicClient
}

describe('verifyOrSplit', () => {
  it('returns the call unchanged when estimate is under target', async () => {
    const names = Array.from({ length: 4 }, (_, i) =>
      makeName(`n${i}.eth`, 'unwrapped'),
    )
    const initial = buildBatchedMigrateCalls({
      classified: names,
      migrationOwner: owner,
      defaultResolver: '0x0000000000000000000000000000000000000002' as Address,
      ownedPermRes: null,
    })
    const mutable = {
      calls: [...initial.calls],
      batches: initial.batches.map((b) => ({ ...b })),
    }
    const publicClient = makePublicClient([15_000_000n])

    const result = await verifyOrSplit({
      publicClient,
      account: owner,
      mutablePlan: mutable,
      index: 0,
      migrateBatchClassified: { 0: names },
      targetGas: TARGET_GAS,
      migrationOwner: owner,
      defaultResolver: '0x0000000000000000000000000000000000000002' as Address,
      ownedPermRes: null,
    })

    expect(result).toBe(mutable.calls[0])
    expect(mutable.calls).toHaveLength(1)
    expect(mutable.batches[0]!.estimatedGas).toBe(15_000_000n)
  })

  it('bisects when estimate exceeds target, then settles', async () => {
    const names = Array.from({ length: 4 }, (_, i) =>
      makeName(`n${i}.eth`, 'unwrapped'),
    )
    const initial = buildBatchedMigrateCalls({
      classified: names,
      migrationOwner: owner,
      defaultResolver: '0x0000000000000000000000000000000000000002' as Address,
      ownedPermRes: null,
    })
    const mutable = {
      calls: [...initial.calls],
      batches: initial.batches.map((b) => ({ ...b })),
    }
    const publicClient = makePublicClient([
      35_000_000n, // initial: over budget → bisect
      18_000_000n, // left half: under budget → accepted
    ])

    const result = await verifyOrSplit({
      publicClient,
      account: owner,
      mutablePlan: mutable,
      index: 0,
      migrateBatchClassified: { 0: names },
      targetGas: TARGET_GAS,
      migrationOwner: owner,
      defaultResolver: '0x0000000000000000000000000000000000000002' as Address,
      ownedPermRes: null,
    })

    expect(mutable.calls).toHaveLength(2)
    expect(result).toBe(mutable.calls[0])
    expect(mutable.batches[0]!.names).toHaveLength(2)
    expect(mutable.batches[1]!.names).toHaveLength(2)
  })

  it('throws when a single-name batch still exceeds target', async () => {
    const names = [makeName('huge.eth', 'unwrapped')]
    const initial = buildBatchedMigrateCalls({
      classified: names,
      migrationOwner: owner,
      defaultResolver: '0x0000000000000000000000000000000000000002' as Address,
      ownedPermRes: null,
    })
    const mutable = {
      calls: [...initial.calls],
      batches: initial.batches.map((b) => ({ ...b })),
    }
    const publicClient = makePublicClient([40_000_000n])

    await expect(
      verifyOrSplit({
        publicClient,
        account: owner,
        mutablePlan: mutable,
        index: 0,
        migrateBatchClassified: { 0: names },
        targetGas: TARGET_GAS,
        migrationOwner: owner,
        defaultResolver:
          '0x0000000000000000000000000000000000000002' as Address,
        ownedPermRes: null,
      }),
    ).rejects.toThrow(/single-name batch/i)
  })

  it('propagates estimateGas revert', async () => {
    const names = [makeName('a.eth', 'unwrapped')]
    const initial = buildBatchedMigrateCalls({
      classified: names,
      migrationOwner: owner,
      defaultResolver: '0x0000000000000000000000000000000000000002' as Address,
      ownedPermRes: null,
    })
    const mutable = {
      calls: [...initial.calls],
      batches: initial.batches.map((b) => ({ ...b })),
    }
    const publicClient = {
      estimateGas: vi.fn().mockRejectedValueOnce(new Error('revert: bad data')),
    } as unknown as PublicClient

    await expect(
      verifyOrSplit({
        publicClient,
        account: owner,
        mutablePlan: mutable,
        index: 0,
        migrateBatchClassified: { 0: names },
        targetGas: TARGET_GAS,
        migrationOwner: owner,
        defaultResolver:
          '0x0000000000000000000000000000000000000002' as Address,
        ownedPermRes: null,
      }),
    ).rejects.toThrow(/revert: bad data/)
  })
})

import { largeClassified } from './_fixtures/largeClassified'

describe('partitionForMigrate with largeClassified fixture', () => {
  it('produces a deterministic partition that preserves topo order within batches', () => {
    const batches = partitionForMigrate(largeClassified, defaultOpts)
    expect(batches.flat()).toHaveLength(largeClassified.length)
    for (const batch of batches) {
      const seen = new Set<string>()
      for (const n of batch) {
        const isChild =
          n.tokenType === 'locked-child' || n.tokenType === 'detached-child'
        const parentInBatch =
          isChild &&
          n.parentName &&
          batch.some((b) => b.domain.name === n.parentName)
        if (parentInBatch) {
          expect(seen.has(n.parentName!)).toBe(true)
        }
        seen.add(n.domain.name)
      }
    }
  })
})
