import type { Address } from 'viem'
import { zeroAddress } from 'viem'
import { assert, describe, expect, it, vi } from 'vitest'
import { makeClassified } from './_fixtures'
import type { ClassifiedName } from './classifyNames'
import {
  buildDeferredPlaceholderRegistries,
  calcBundleBytes,
  collectDeferredParentNames,
  computePhase1Names,
  findNestedDeferredParents,
  findUnresolvedParents,
  formatNamesPreview,
  groupDeferredChildrenByParent,
  packPlanBatches,
  partitionChildrenByInPlan,
} from './migrationPlan.helpers'

const child = (name: string, parentName: string | null = null) =>
  makeClassified({
    tokenType: 'locked-child',
    name,
    parentName,
    id: `id-${name}`,
  })

const PARENT_A: Address = '0x00000000000000000000000000000000000000a1'
const PARENT_B: Address = '0x00000000000000000000000000000000000000b1'

describe('calcBundleBytes', () => {
  it('sums data byte length + 64 overhead per call', () => {
    expect(
      calcBundleBytes([
        { to: zeroAddress, value: 0n, data: `0x${'ab'.repeat(10)}` },
        { to: zeroAddress, value: 0n, data: `0x${'cd'.repeat(5)}` },
      ]),
    ).toBe(10 + 64 + 5 + 64)
  })

  it('handles empty data and empty array', () => {
    expect(calcBundleBytes([])).toBe(0)
    expect(calcBundleBytes([{ to: zeroAddress, value: 0n, data: '0x' }])).toBe(
      64,
    )
  })
})

describe('groupDeferredChildrenByParent', () => {
  it('groups children by parentName and skips children without one', () => {
    const a = child('a.raffy.eth', 'raffy.eth')
    const b = child('b.raffy.eth', 'raffy.eth')
    const c = child('c.nick.eth', 'nick.eth')
    const orphan = child('o.eth', null)
    const out = groupDeferredChildrenByParent([a, b, c, orphan])
    expect(out.get('raffy.eth')).toEqual([a, b])
    expect(out.get('nick.eth')).toEqual([c])
    expect(out.size).toBe(2)
  })
})

describe('buildDeferredPlaceholderRegistries', () => {
  it('maps every name to the deferred placeholder address', () => {
    const out = buildDeferredPlaceholderRegistries(['a.eth', 'b.eth'])
    expect(out.size).toBe(2)
    const placeholder = out.get('a.eth')
    expect(placeholder).toBe(out.get('b.eth'))
    expect(placeholder).not.toBe(zeroAddress)
  })
})

describe('partitionChildrenByInPlan', () => {
  it('puts children whose parent is in plan into deferred, else external', () => {
    const a = child('a.raffy.eth', 'raffy.eth')
    const b = child('b.nick.eth', 'nick.eth')
    const childMap = new Map<string, readonly ClassifiedName[]>([
      ['raffy.eth', [a]],
      ['nick.eth', [b]],
    ])
    const { externalChildren, deferredChildren, deferredParentNames } =
      partitionChildrenByInPlan(childMap, new Set(['raffy.eth']))
    expect(deferredChildren).toEqual([a])
    expect(deferredParentNames).toEqual(['raffy.eth'])
    expect([...externalChildren.keys()]).toEqual(['nick.eth'])
  })
})

describe('findNestedDeferredParents', () => {
  it('returns names that are both a deferred parent and a deferred child', () => {
    const parent = child('a.eth', 'eth')
    const grandchild = child('a.eth', 'b.eth')
    expect(
      findNestedDeferredParents([parent, grandchild], ['a.eth', 'c.eth']),
    ).toEqual(['a.eth'])
  })

  it('returns empty when no nesting exists', () => {
    expect(
      findNestedDeferredParents(
        [child('x.raffy.eth', 'raffy.eth')],
        ['raffy.eth'],
      ),
    ).toEqual([])
  })
})

describe('findUnresolvedParents', () => {
  it('returns parents whose registry resolved to the zero address', () => {
    const externalChildren = new Map<string, readonly ClassifiedName[]>([
      ['raffy.eth', [child('x.raffy.eth', 'raffy.eth')]],
      ['nick.eth', [child('y.nick.eth', 'nick.eth')]],
    ])
    const resolved = new Map<string, Address>([
      ['raffy.eth', PARENT_A],
      ['nick.eth', zeroAddress],
    ])
    expect(
      findUnresolvedParents(externalChildren, resolved, zeroAddress),
    ).toEqual(['nick.eth'])
  })

  it('treats missing parents as unresolved', () => {
    const externalChildren = new Map<string, readonly ClassifiedName[]>([
      ['a.eth', [child('x.a.eth', 'a.eth')]],
    ])
    expect(
      findUnresolvedParents(externalChildren, new Map(), zeroAddress),
    ).toEqual(['a.eth'])
  })
})

describe('formatNamesPreview', () => {
  it.each([
    [['a.eth'], 'a.eth'],
    [['a.eth', 'b.eth'], 'a.eth, b.eth'],
    [['a.eth', 'b.eth', 'c.eth'], 'a.eth, b.eth, c.eth'],
    [['a.eth', 'b.eth', 'c.eth', 'd.eth'], 'a.eth, b.eth, c.eth (+1 more)'],
    [
      ['a.eth', 'b.eth', 'c.eth', 'd.eth', 'e.eth'],
      'a.eth, b.eth, c.eth (+2 more)',
    ],
  ])('formats %j', (names, expected) => {
    expect(formatNamesPreview(names)).toBe(expected)
  })

  it('respects custom limit', () => {
    expect(formatNamesPreview(['a', 'b', 'c'], 1)).toBe('a (+2 more)')
  })
})

describe('computePhase1Names', () => {
  it('drops classified whose name is in deferredChildren', () => {
    const a = makeClassified({ id: '0xa', name: 'a.eth' })
    const b = makeClassified({ id: '0xb', name: 'b.eth' })
    const c = makeClassified({ id: '0xc', name: 'c.eth' })
    expect(computePhase1Names([a, b, c], [b])).toEqual([a, c])
  })
})

describe('collectDeferredParentNames', () => {
  it('returns unique parentNames from deferred children, dropping null', () => {
    const a = child('a.raffy.eth', 'raffy.eth')
    const b = child('b.raffy.eth', 'raffy.eth')
    const c = child('c.nick.eth', 'nick.eth')
    const orphan = child('orphan.eth', null)
    expect(collectDeferredParentNames([a, b, c, orphan])).toEqual([
      'raffy.eth',
      'nick.eth',
    ])
  })
})

describe('packPlanBatches', () => {
  it('calls pack for phase1 and skips deferred pack when no deferred children', () => {
    const pack = vi
      .fn<Parameters<typeof packPlanBatches>[0]['pack']>()
      .mockReturnValue([])
    packPlanBatches({
      phase1Names: [],
      deferredChildren: [],
      deferredParentNames: [],
      parentRegistries: new Map(),
      migrationOwner: PARENT_A,
      defaultResolver: PARENT_B,
      ownedPermRes: null,
      profiles: new Map(),
      pack,
    })
    expect(pack).toHaveBeenCalledTimes(1)
  })

  it('passes placeholder registries to the deferred pack call', () => {
    const pack = vi
      .fn<Parameters<typeof packPlanBatches>[0]['pack']>()
      .mockReturnValue([])
    const deferredChild = child('x.raffy.eth', 'raffy.eth')
    packPlanBatches({
      phase1Names: [],
      deferredChildren: [deferredChild],
      deferredParentNames: ['raffy.eth'],
      parentRegistries: new Map(),
      migrationOwner: PARENT_A,
      defaultResolver: PARENT_B,
      ownedPermRes: null,
      profiles: new Map(),
      pack,
    })
    expect(pack).toHaveBeenCalledTimes(2)
    const deferredCall = pack.mock.calls[1]?.[0]
    assert(deferredCall)
    expect(deferredCall.parentRegistries.get('raffy.eth')).not.toBe(zeroAddress)
    expect(deferredCall.parentRegistries.get('raffy.eth')).toBeDefined()
  })
})
