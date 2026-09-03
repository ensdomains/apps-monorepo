import { describe, expect, it } from 'vitest'
import type { ClassifiedName } from './classifyNames'
import { groupByParent, type NameTreeNode } from './groupByParent'

const makeName = (
  fullName: string,
  tokenType: ClassifiedName['tokenType'],
  action: 'copy' | 'migrate' = 'migrate',
): ClassifiedName => {
  const label = fullName.split('.')[0]
  const parentName = fullName.includes('.')
    ? fullName.split('.').slice(1).join('.')
    : null
  return {
    action,
    ...(action === 'copy'
      ? {
          copySource: 'name-wrapper' as const,
          sourceExpiry: 4_102_444_800n,
        }
      : {}),
    domain: {
      id: fullName,
      name: fullName,
      labelName: label,
    },
    tokenType,
    label,
    parentName,
    fuses: 0,
    tokenHolder: '0x0000000000000000000000000000000000000001',
    v1ResolverAddress: null,
    resolverStrategy: 'to-owned-permres',
    managerAddress: null,
  } as unknown as ClassifiedName
}

const nodeNames = (nodes: readonly NameTreeNode[]): readonly string[] =>
  nodes.map((node) => node.item.domain.name)

describe('groupByParent', () => {
  it('returns empty groups and orphans for empty input', () => {
    expect(groupByParent([])).toEqual({ groups: [], orphans: [] })
  })

  it('returns 2LDs as sorted tree roots', () => {
    const b = makeName('b.eth', 'unwrapped')
    const a = makeName('a.eth', 'locked-2ld')
    const { groups, orphans } = groupByParent([b, a])

    expect(nodeNames(groups)).toEqual(['a.eth', 'b.eth'])
    expect(groups.every((group) => group.children.length === 0)).toBe(true)
    expect(orphans).toEqual([])
  })

  it('builds a recursively sorted descendant tree', () => {
    const parent = makeName('example.eth', 'unwrapped')
    const childB = makeName('b.example.eth', 'locked-child')
    const childA = makeName('a.example.eth', 'locked-child')
    const grandchild = makeName('deep.a.example.eth', 'unlocked-child', 'copy')

    const { groups, orphans } = groupByParent([
      grandchild,
      childB,
      parent,
      childA,
    ])

    expect(orphans).toEqual([])
    expect(nodeNames(groups)).toEqual(['example.eth'])
    const root = groups[0]
    if (!root) throw new Error('expected root')
    expect(nodeNames(root.children)).toEqual(['a.example.eth', 'b.example.eth'])
    expect(nodeNames(root.children[0]?.children ?? [])).toEqual([
      'deep.a.example.eth',
    ])
  })

  it('keeps a missing-parent branch together as an orphan tree', () => {
    const orphan = makeName('a.missing.eth', 'locked-child')
    const descendant = makeName('deep.a.missing.eth', 'unlocked-child', 'copy')
    const other = makeName('other.eth', 'unwrapped')

    const { groups, orphans } = groupByParent([descendant, other, orphan])

    expect(nodeNames(groups)).toEqual(['other.eth'])
    expect(nodeNames(orphans)).toEqual(['a.missing.eth'])
    expect(nodeNames(orphans[0]?.children ?? [])).toEqual([
      'deep.a.missing.eth',
    ])
  })

  it('keeps descendants attached to their own roots', () => {
    const rootA = makeName('a.eth', 'unwrapped')
    const rootB = makeName('b.eth', 'locked-2ld')
    const childA = makeName('x.a.eth', 'locked-child')
    const childB = makeName('z.b.eth', 'locked-child')
    const orphan = makeName('o.missing.eth', 'locked-child')

    const { groups, orphans } = groupByParent([
      childB,
      orphan,
      rootB,
      childA,
      rootA,
    ])

    expect(nodeNames(groups)).toEqual(['a.eth', 'b.eth'])
    expect(nodeNames(groups[0]?.children ?? [])).toEqual(['x.a.eth'])
    expect(nodeNames(groups[1]?.children ?? [])).toEqual(['z.b.eth'])
    expect(nodeNames(orphans)).toEqual(['o.missing.eth'])
  })
})
