import { describe, expect, it } from 'vitest'
import { toLinks } from './useResolverOverview'

// Shape mirrors the indexer's `resolvers(where: { address }) { linkedNames }`,
// which is the live name -> recordId mapping built from `Linked` events. The
// legacy `aliases` field is never populated for a V2 resolver.
const entry = (...names: { name: string; recordId: string }[]) => ({
  linkedNames: names.map((n) => ({
    name: n.name,
    namehash: `0x${n.name.length.toString(16).padStart(64, '0')}`,
    recordId: n.recordId,
  })),
})

describe('toLinks', () => {
  it('returns nothing when there is no data', () => {
    expect(toLinks(null)).toEqual([])
    expect(toLinks([])).toEqual([])
    expect(toLinks([{ linkedNames: null }])).toEqual([])
  })

  it('ignores a record used by a single name', () => {
    expect(
      toLinks([
        entry({ name: 'a.eth', recordId: '1' }),
        entry({ name: 'b.eth', recordId: '2' }),
      ]),
    ).toEqual([])
  })

  it('pairs the names that share a record, each listing the others', () => {
    const links = toLinks([
      entry({ name: 'a.eth', recordId: '7' }),
      entry({ name: 'b.eth', recordId: '7' }),
      entry({ name: 'solo.eth', recordId: '9' }),
    ])

    expect(links).toHaveLength(2)
    expect(links.map((l) => l.name).toSorted()).toEqual(['a.eth', 'b.eth'])
    expect(links.find((l) => l.name === 'a.eth')?.sharedWith).toEqual(['b.eth'])
    expect(links.find((l) => l.name === 'b.eth')?.sharedWith).toEqual(['a.eth'])
    expect(links.every((l) => l.recordId === '7')).toBe(true)
  })

  it('handles more than two names on one record', () => {
    const links = toLinks([
      entry(
        { name: 'a.eth', recordId: '3' },
        { name: 'b.eth', recordId: '3' },
        { name: 'c.eth', recordId: '3' },
      ),
    ])

    expect(links).toHaveLength(3)
    expect(
      links.find((l) => l.name === 'b.eth')?.sharedWith.toSorted(),
    ).toEqual(['a.eth', 'c.eth'])
  })
})
