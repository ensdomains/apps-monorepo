import { describe, expect, it } from 'vitest'
import {
  type CursorRow,
  decodeMergeCursor,
  EMPTY_PAGE,
  encodeMergeCursor,
  type MergeCursor,
  mergePages,
  type SourcePage,
  START,
} from './merge'

const rows = (names: readonly string[], prefix: string) =>
  names.map(
    (name): CursorRow<string> => ({ item: name, after: `${prefix}:${name}` }),
  )

const page = (
  names: readonly string[],
  prefix: string,
  { hasMore = false, totalCount = names.length as number | null } = {},
): SourcePage<string> => ({
  rows: rows(names, prefix),
  hasMore,
  endCursor: names.length > 0 ? `${prefix}:${names.at(-1)}` : null,
  totalCount,
})

const merge = (
  first: SourcePage<string>,
  second: SourcePage<string>,
  pageSize = 10,
  cursor: MergeCursor = START,
) =>
  mergePages({
    first,
    second,
    cursor,
    pageSize,
    compare: (a, b) => a.localeCompare(b),
    keyOf: (name) => name,
  })

describe('mergePages', () => {
  it('interleaves both sources in sort order and ends when both are exhausted', () => {
    expect(merge(page(['a', 'c'], 'v2'), page(['b', 'd'], 'v1'))).toEqual({
      items: ['a', 'b', 'c', 'd'],
      nextCursor: null,
      totalCount: 4,
    })
  })

  it('keeps one row per key and counts the duplicate out of the total', () => {
    const merged = merge(page(['a', 'b'], 'v2'), page(['b', 'c'], 'v1'))

    expect(merged.items).toEqual(['a', 'b', 'c'])
    expect(merged.totalCount).toBe(3)
  })

  it('resumes each source after the last row it gave to a full page', () => {
    const merged = merge(page(['a', 'c', 'e'], 'v2'), page(['b', 'd'], 'v1'), 3)

    expect(merged.items).toEqual(['a', 'b', 'c'])
    expect(merged.nextCursor).toEqual({ first: 'v2:c', second: 'v1:b' })
  })

  it('stops at the end of a page that has more, rather than outrun it', () => {
    const merged = merge(
      page(['a', 'b'], 'v2', { hasMore: true }),
      page(['c', 'd'], 'v1'),
    )

    expect(merged.items).toEqual(['a', 'b'])
    expect(merged.nextCursor).toEqual({ first: 'v2:b', second: undefined })
  })

  it('drains the other source once one runs out', () => {
    const merged = merge(EMPTY_PAGE, page(['a', 'b'], 'v1'), 10, {
      first: null,
      second: 'v1:start',
    })

    expect(merged).toEqual({
      items: ['a', 'b'],
      nextCursor: null,
      totalCount: 2,
    })
  })

  it('moves past a page whose rows were all dropped', () => {
    const dropped: SourcePage<string> = {
      rows: [],
      hasMore: true,
      endCursor: 'v2:z',
      totalCount: null,
    }

    const merged = merge(dropped, page(['a'], 'v1'))

    expect(merged.items).toEqual([])
    expect(merged.nextCursor).toEqual({ first: 'v2:z', second: undefined })
  })

  it('reports no total when either source cannot count', () => {
    expect(
      merge(page(['a'], 'v2'), page(['b'], 'v1', { totalCount: null }))
        .totalCount,
    ).toBeNull()
  })
})

describe('merge cursors', () => {
  it('round-trips through the opaque encoding', () => {
    const cursor = { first: 'abc', second: null }

    expect(
      decodeMergeCursor(encodeMergeCursor(cursor))._unsafeUnwrap(),
    ).toEqual(cursor)
  })

  it.each(['not base64 json', btoa('[1,2]'), btoa('{"first":1}')])(
    'rejects %s',
    (cursor) => {
      expect(decodeMergeCursor(cursor)._unsafeUnwrapErr().kind).toBe('rejected')
    },
  )
})
