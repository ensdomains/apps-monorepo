import type { ServiceRecordSnapshot } from './profileRecordTransactions'

export interface ResolverRecordWrite {
  readonly key: string
  readonly value: string
}

export interface ResolverRecordReview {
  readonly editedKeys: readonly string[]
  readonly writes: readonly ResolverRecordWrite[]
}

/** A replacement starts empty, so unchanged source records and deletions need no setters. */
export const getResolverReplacementRecords = (
  before: ServiceRecordSnapshot,
  after: ServiceRecordSnapshot,
): ServiceRecordSnapshot => {
  const beforeTexts = new Map(
    before.texts.map(({ key, value }) => [key, value.trim()]),
  )
  const beforeCoins = new Map(
    before.coins.map(({ coinType, value }) => [coinType, value.trim()]),
  )
  const changedOptionalRecord = (previous?: string, current?: string) =>
    current?.trim() && previous?.trim() !== current.trim()
      ? current.trim()
      : undefined

  return {
    texts: after.texts
      .filter(
        ({ key, value }) =>
          value.trim() && value.trim() !== (beforeTexts.get(key) ?? ''),
      )
      .map(({ key, value }) => ({ key, value })),
    coins: after.coins
      .filter(
        ({ coinType, value }) =>
          value.trim() && value.trim() !== (beforeCoins.get(coinType) ?? ''),
      )
      .map(({ coinType, value }) => ({ coinType, value: value.trim() })),
    contentHash: changedOptionalRecord(before.contentHash, after.contentHash),
    abi: changedOptionalRecord(before.abi, after.abi),
  }
}

/** Keys include their setter family so a text key cannot authorize an address write. */
export const getResolverRecordWrites = (
  records: ServiceRecordSnapshot,
): ResolverRecordWrite[] => [
  ...records.texts.map(({ key, value }) => ({ key: `text:${key}`, value })),
  ...records.coins.map(({ coinType, value }) => ({
    key: `addr:${coinType}`,
    value,
  })),
  ...(records.contentHash
    ? [{ key: 'contenthash', value: records.contentHash }]
    : []),
  ...(records.abi ? [{ key: 'ABI', value: records.abi }] : []),
]

/** Include removals so an owner can explicitly replace a profile with empty records. */
export const getEditedResolverRecordKeys = (
  before: ServiceRecordSnapshot,
  after: ServiceRecordSnapshot,
): string[] => {
  const original = new Map(
    getResolverRecordWrites(before).map(({ key, value }) => [
      key,
      value.trim(),
    ]),
  )
  const current = new Map(
    getResolverRecordWrites(after).map(({ key, value }) => [key, value.trim()]),
  )
  return [...new Set([...original.keys(), ...current.keys()])].filter(
    (key) => (original.get(key) ?? '') !== (current.get(key) ?? ''),
  )
}

export const assertResolverRecordReview = (
  records: ServiceRecordSnapshot,
  review: ResolverRecordReview,
): void => {
  const writes = getResolverRecordWrites(records)
  const editedKeys = new Set(review.editedKeys)
  if (writes.some(({ key }) => !editedKeys.has(key)))
    throw new Error(
      'The resolver write includes a record you have not edited. Review your changes again.',
    )
  const reviewed = new Map(review.writes.map(({ key, value }) => [key, value]))
  if (
    reviewed.size !== review.writes.length ||
    new Set(writes.map(({ key }) => key)).size !== writes.length ||
    writes.length !== reviewed.size ||
    writes.some(({ key, value }) => reviewed.get(key) !== value)
  )
    throw new Error(
      'The resolver writes changed after review. Review your changes again.',
    )
}
