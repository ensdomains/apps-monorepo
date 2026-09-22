import { describe, expect, it } from 'vitest'
import { makeClassified } from '../service/_fixtures'
import type { ClassifiedName } from '../service/classifyNames'
import type { NameTreeNode } from '../service/groupByParent'
import {
  buildRootSubtreeIndex,
  collectAllSelectable,
  filterGroupsBySearch,
  shouldShowBulkSelection,
  shouldShowNameSearch,
  shouldUseCompactSelectionLayout,
  shouldUseSmallSelectionCard,
  toggleRootSubtree,
} from './selectNames.helpers'

const name = (
  value: string,
  action: 'copy' | 'migrate' = 'migrate',
): ClassifiedName =>
  makeClassified({
    action,
    id: value,
    name: value,
    label: value.split('.')[0],
    tokenType:
      action === 'copy'
        ? 'unlocked-child'
        : value.split('.').length === 2
          ? 'unwrapped'
          : 'locked-child',
  })

const tree = (
  value: string,
  children: readonly NameTreeNode[] = [],
  action: 'copy' | 'migrate' = 'migrate',
): NameTreeNode => ({ item: name(value, action), children })

const groupedTree = tree('a.eth', [
  tree('x.a.eth', [tree('deep.x.a.eth', [], 'copy')]),
  tree('y.a.eth', [], 'copy'),
])

describe('collectAllSelectable', () => {
  it('collects every name across recursive groups and orphan trees', () => {
    expect(
      collectAllSelectable(
        [groupedTree, tree('b.eth')],
        [tree('o.missing.eth', [tree('deep.o.missing.eth')])],
      ),
    ).toEqual(
      new Set([
        'a.eth',
        'x.a.eth',
        'deep.x.a.eth',
        'y.a.eth',
        'b.eth',
        'o.missing.eth',
        'deep.o.missing.eth',
      ]),
    )
  })

  it('returns an empty set for no input', () => {
    expect(collectAllSelectable([], [])).toEqual(new Set())
  })
})

describe('buildRootSubtreeIndex', () => {
  it('indexes each interactive root with its complete subtree', () => {
    const index = buildRootSubtreeIndex([groupedTree], [tree('orphan.eth')])

    expect(index.get('a.eth')).toEqual(
      new Set(['a.eth', 'x.a.eth', 'deep.x.a.eth', 'y.a.eth']),
    )
    expect(index.get('orphan.eth')).toEqual(new Set(['orphan.eth']))
    expect(index.has('x.a.eth')).toBe(false)
  })
})

describe('toggleRootSubtree', () => {
  const index = buildRootSubtreeIndex([groupedTree], [])

  it('selects the entire tree when selecting its root', () => {
    expect(toggleRootSubtree(new Set(), 'a.eth', index)).toEqual(
      new Set(['a.eth', 'x.a.eth', 'deep.x.a.eth', 'y.a.eth']),
    )
  })

  it('deselects the entire root subtree and preserves other selections', () => {
    const selected = new Set([
      'a.eth',
      'x.a.eth',
      'deep.x.a.eth',
      'y.a.eth',
      'other.eth',
    ])

    expect(toggleRootSubtree(selected, 'a.eth', index)).toEqual(
      new Set(['other.eth']),
    )
    expect(selected.has('a.eth')).toBe(true)
  })

  it('returns an unchanged copy when the name is not indexed', () => {
    const selected = new Set(['a.eth'])
    const next = toggleRootSubtree(selected, 'missing.eth', index)

    expect(next).toEqual(selected)
    expect(next).not.toBe(selected)
  })
})

describe('filterGroupsBySearch', () => {
  const groups = [groupedTree, tree('nick.eth')]

  it('returns the original list when search is empty', () => {
    expect(filterGroupsBySearch(groups, '')).toBe(groups)
  })

  it('keeps a matching root and its complete subtree', () => {
    const filtered = filterGroupsBySearch(groups, 'a.eth')

    expect(filtered).toEqual([groupedTree])
  })

  it('keeps only the ancestor path to a matching descendant', () => {
    const filtered = filterGroupsBySearch(groups, 'deep')
    const root = filtered[0]

    expect(root?.item.domain.name).toBe('a.eth')
    expect(root?.children.map((child) => child.item.domain.name)).toEqual([
      'x.a.eth',
    ])
    expect(root?.children[0]?.children[0]?.item.domain.name).toBe(
      'deep.x.a.eth',
    )
  })

  it('is case-insensitive on a lowercased query', () => {
    expect(filterGroupsBySearch(groups, 'nick')).toHaveLength(1)
  })
})

describe('selection layout thresholds', () => {
  it('shows bulk selection at 15 names and above', () => {
    expect(shouldShowBulkSelection(14)).toBe(false)
    expect(shouldShowBulkSelection(15)).toBe(true)
    expect(shouldShowBulkSelection(16)).toBe(true)
  })

  it('shows search at 9 names and above', () => {
    expect(shouldShowNameSearch(8)).toBe(false)
    expect(shouldShowNameSearch(9)).toBe(true)
  })

  it('uses the compact layout at 10 names and above', () => {
    expect(shouldUseCompactSelectionLayout(9)).toBe(false)
    expect(shouldUseCompactSelectionLayout(10)).toBe(true)
    expect(shouldUseCompactSelectionLayout(15)).toBe(true)
  })

  it('uses a small card only for 1-6 names', () => {
    expect(shouldUseSmallSelectionCard(0)).toBe(false)
    expect(shouldUseSmallSelectionCard(1)).toBe(true)
    expect(shouldUseSmallSelectionCard(6)).toBe(true)
    expect(shouldUseSmallSelectionCard(7)).toBe(false)
  })
})
