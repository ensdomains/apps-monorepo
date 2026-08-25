import { describe, expect, it } from 'vitest'
import { makeClassified } from '../service/_fixtures'
import type { ClassifiedName } from '../service/classifyNames'
import type { NameTreeNode } from '../service/groupByParent'
import {
  buildNameTreeIndex,
  collectAllSelectable,
  countVisibleRows,
  filterGroupsBySearch,
  filterOrphansBySearch,
  shouldShowBulkSelection,
  shouldShowNameSearch,
  shouldUseCompactSelectionLayout,
  shouldUseSmallSelectionCard,
  toggleTreeNode,
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

describe('buildNameTreeIndex', () => {
  it('indexes ancestors and complete subtrees once', () => {
    const index = buildNameTreeIndex([groupedTree], [])

    expect(index.ancestorsByName.get('deep.x.a.eth')).toEqual([
      'a.eth',
      'x.a.eth',
    ])
    expect(index.subtreeNamesByName.get('x.a.eth')).toEqual(
      new Set(['x.a.eth', 'deep.x.a.eth']),
    )
  })
})

describe('toggleTreeNode', () => {
  const index = buildNameTreeIndex([groupedTree], [])

  it('selects a node, its required ancestors, and its subtree', () => {
    expect(toggleTreeNode(new Set(), 'x.a.eth', index)).toEqual(
      new Set(['a.eth', 'x.a.eth', 'deep.x.a.eth']),
    )
  })

  it('selects the entire tree when selecting its root', () => {
    expect(toggleTreeNode(new Set(), 'a.eth', index)).toEqual(
      new Set(['a.eth', 'x.a.eth', 'deep.x.a.eth', 'y.a.eth']),
    )
  })

  it('deselects only the node subtree and preserves ancestors and siblings', () => {
    const selected = new Set(['a.eth', 'x.a.eth', 'deep.x.a.eth', 'y.a.eth'])

    expect(toggleTreeNode(selected, 'x.a.eth', index)).toEqual(
      new Set(['a.eth', 'y.a.eth']),
    )
    expect(selected).toEqual(
      new Set(['a.eth', 'x.a.eth', 'deep.x.a.eth', 'y.a.eth']),
    )
  })

  it('returns an unchanged copy when the name is not indexed', () => {
    const selected = new Set(['a.eth'])
    const next = toggleTreeNode(selected, 'missing.eth', index)

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

describe('filterOrphansBySearch', () => {
  const orphans = [
    tree('one.missing.eth', [tree('deep.one.missing.eth')]),
    tree('two.missing.eth'),
  ]

  it('returns the original list when search is empty', () => {
    expect(filterOrphansBySearch(orphans, '')).toBe(orphans)
  })

  it('filters orphan trees while preserving ancestor context', () => {
    const filtered = filterOrphansBySearch(orphans, 'deep')

    expect(filtered).toHaveLength(1)
    expect(filtered[0]?.item.domain.name).toBe('one.missing.eth')
    expect(filtered[0]?.children[0]?.item.domain.name).toBe(
      'deep.one.missing.eth',
    )
  })
})

describe('countVisibleRows', () => {
  it('counts every recursive group and orphan row', () => {
    expect(
      countVisibleRows(
        [groupedTree, tree('b.eth')],
        [tree('o.missing.eth', [tree('deep.o.missing.eth')])],
      ),
    ).toBe(7)
  })

  it('is zero for no input', () => {
    expect(countVisibleRows([], [])).toBe(0)
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
