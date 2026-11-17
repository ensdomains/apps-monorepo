import { err, ok, Result } from 'neverthrow'
import { IndexerReadError } from '../reads/errors'

/** A row and the source cursor that resumes right after it. */
export type CursorRow<Item> = Readonly<{ item: Item; after: string }>

/** One page from one source, rows already in the merged sort order. */
export type SourcePage<Item> = Readonly<{
  /** Rows a caller dropped after reading are simply absent. */
  rows: readonly CursorRow<Item>[]
  hasMore: boolean
  /** Resumes after the last row read, dropped ones included; null when none were. */
  endCursor: string | null
  totalCount: number | null
}>

/** Where each of two sources resumes; `null` once that source has nothing left. */
export type MergeCursor = Readonly<{
  first: string | undefined | null
  second: string | undefined | null
}>

export const START: MergeCursor = { first: undefined, second: undefined }

export const encodeMergeCursor = (cursor: MergeCursor): string =>
  btoa(JSON.stringify(cursor))

const isSourceCursor = (value: unknown): value is string | null | undefined =>
  value === undefined || value === null || typeof value === 'string'

const toCursorError = (cause: unknown) =>
  new IndexerReadError({
    kind: 'rejected',
    message: 'Not a cursor this indexer issued',
    cause,
  })

const parseCursor = Result.fromThrowable(
  (cursor: string): unknown => JSON.parse(atob(cursor)),
  toCursorError,
)

const toMergeCursor = (
  parsed: unknown,
): Result<MergeCursor, IndexerReadError> => {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return err(toCursorError(parsed))
  }
  const first = 'first' in parsed ? parsed.first : undefined
  const second = 'second' in parsed ? parsed.second : undefined
  return isSourceCursor(first) && isSourceCursor(second)
    ? ok({ first, second })
    : err(toCursorError(parsed))
}

export const decodeMergeCursor = (
  cursor: string | undefined,
): Result<MergeCursor, IndexerReadError> =>
  cursor === undefined ? ok(START) : parseCursor(cursor).andThen(toMergeCursor)

type MergePagesParameters<Item> = Readonly<{
  first: SourcePage<Item>
  second: SourcePage<Item>
  /** Where each page started, so a source this page took nothing from stays put. */
  cursor: MergeCursor
  compare: (a: Item, b: Item) => number
  /** Rows with the same key are one entry; the `first` source's row wins. */
  keyOf: (item: Item) => string
  pageSize: number
}>

export type MergedPage<Item> = Readonly<{
  items: readonly Item[]
  /** Null when both sources are exhausted. */
  nextCursor: MergeCursor | null
  /** Both totals, less the duplicates this page saw; null when either source does not count. */
  totalCount: number | null
}>

type Step<Item> = Readonly<{
  items: readonly Item[]
  i: number
  j: number
  duplicates: number
}>

const advance = <Item>(
  params: MergePagesParameters<Item>,
  step: Step<Item>,
): Step<Item> => {
  const { first, second, compare, keyOf, pageSize } = params
  const { items, i, j, duplicates } = step
  if (items.length >= pageSize) return step
  const a = first.rows[i]
  const b = second.rows[j]
  // A source whose page ran out but has more cannot be compared past its last row.
  if (!a && first.hasMore) return step
  if (!b && second.hasMore) return step
  if (!a && !b) return step
  if (a && b && keyOf(a.item) === keyOf(b.item)) {
    return advance(params, {
      items: [...items, a.item],
      i: i + 1,
      j: j + 1,
      duplicates: duplicates + 1,
    })
  }
  const takeV2 = !b || (a !== undefined && compare(a.item, b.item) <= 0)
  return advance(
    params,
    takeV2 && a
      ? { items: [...items, a.item], i: i + 1, j, duplicates }
      : b
        ? { items: [...items, b.item], i, j: j + 1, duplicates }
        : step,
  )
}

const nextSourceCursor = <Item>(
  page: SourcePage<Item>,
  taken: number,
  started: string | undefined | null,
): string | undefined | null => {
  if (taken === page.rows.length) {
    return page.hasMore ? (page.endCursor ?? started) : null
  }
  return taken === 0 ? started : page.rows[taken - 1]?.after
}

/** Merge one page from each of two sorted sources; the cursor resumes each after the last row taken. */
export const mergePages = <Item>(
  params: MergePagesParameters<Item>,
): MergedPage<Item> => {
  const { first, second, cursor } = params
  const { items, i, j, duplicates } = advance(params, {
    items: [],
    i: 0,
    j: 0,
    duplicates: 0,
  })
  const next: MergeCursor = {
    first:
      cursor.first === null ? null : nextSourceCursor(first, i, cursor.first),
    second:
      cursor.second === null
        ? null
        : nextSourceCursor(second, j, cursor.second),
  }
  return {
    items,
    nextCursor: next.first === null && next.second === null ? null : next,
    totalCount:
      first.totalCount === null || second.totalCount === null
        ? null
        : first.totalCount + second.totalCount - duplicates,
  }
}

/** A source with nothing left reads as an empty, finished page. */
export const EMPTY_PAGE: SourcePage<never> = {
  rows: [],
  hasMore: false,
  endCursor: null,
  totalCount: 0,
}
