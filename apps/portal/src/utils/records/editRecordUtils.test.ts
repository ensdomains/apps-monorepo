import { describe, expect, it } from 'vitest'
import {
  createNewRecord,
  type EditableRecord,
  getRecordId,
  mergeRecordsWithChanges,
} from './editRecordUtils'

describe('getRecordId', () => {
  it('returns "contentHash" for contentHash records', () => {
    expect(getRecordId({ type: 'contentHash', value: 'ipfs://abc' })).toBe(
      'contentHash',
    )
  })

  it('returns "address-{key}" for address records', () => {
    expect(
      getRecordId({ type: 'address', key: 'ETH', value: '0x123', id: 60 }),
    ).toBe('address-ETH')
    expect(
      getRecordId({ type: 'address', key: 'BTC', value: 'bc1...', id: 0 }),
    ).toBe('address-BTC')
  })

  it('returns "text-{key}" for text records', () => {
    expect(getRecordId({ type: 'text', key: 'name', value: 'John' })).toBe(
      'text-name',
    )
    expect(
      getRecordId({ type: 'text', key: 'description', value: 'Hello' }),
    ).toBe('text-description')
  })
})

describe('mergeRecordsWithChanges', () => {
  const originalRecords = [
    { type: 'text' as const, key: 'name', value: 'John' },
    { type: 'text' as const, key: 'bio', value: 'Hello' },
    { type: 'address' as const, key: 'ETH', value: '0x123', id: 60 },
  ]

  it('returns original records unchanged when no changes', () => {
    const result = mergeRecordsWithChanges(
      originalRecords,
      [],
      new Map(),
      new Set(),
    )

    expect(result).toHaveLength(3)
    expect(result[0]).toEqual({ type: 'text', key: 'name', value: 'John' })
    expect(result[1]).toEqual({ type: 'text', key: 'bio', value: 'Hello' })
  })

  it('marks edited records with isEdited flag and updates value', () => {
    const editedValues = new Map([['text-name', 'Jane']])

    const result = mergeRecordsWithChanges(
      originalRecords,
      [],
      editedValues,
      new Set(),
    )

    expect(result[0]).toEqual({
      type: 'text',
      key: 'name',
      value: 'Jane',
      isEdited: true,
    })
    expect(result[1]).toEqual({ type: 'text', key: 'bio', value: 'Hello' })
  })

  it('marks deleted records with isDeleted flag', () => {
    const deletedIds = new Set(['text-bio'])

    const result = mergeRecordsWithChanges(
      originalRecords,
      [],
      new Map(),
      deletedIds,
    )

    expect(result[1]).toEqual({
      type: 'text',
      key: 'bio',
      value: 'Hello',
      isDeleted: true,
    })
  })

  it('adds new records with isNew flag', () => {
    const newRecords: EditableRecord[] = [
      { type: 'text', key: 'twitter', value: '@john' },
    ]

    const result = mergeRecordsWithChanges(
      originalRecords,
      newRecords,
      new Map(),
      new Set(),
    )

    expect(result).toHaveLength(4)
    expect(result[3]).toEqual({
      type: 'text',
      key: 'twitter',
      value: '@john',
      isNew: true,
    })
  })

  it('handles multiple changes at once', () => {
    const newRecords: EditableRecord[] = [
      { type: 'text', key: 'twitter', value: '@john' },
    ]
    const editedValues = new Map([['text-name', 'Jane']])
    const deletedIds = new Set(['text-bio'])

    const result = mergeRecordsWithChanges(
      originalRecords,
      newRecords,
      editedValues,
      deletedIds,
    )

    expect(result).toHaveLength(4)
    expect(result[0]).toMatchObject({ value: 'Jane', isEdited: true })
    expect(result[1]).toMatchObject({ isDeleted: true })
    expect(result[3]).toMatchObject({ key: 'twitter', isNew: true })
  })

  it('prioritizes deletion over edit', () => {
    const editedValues = new Map([['text-name', 'Jane']])
    const deletedIds = new Set(['text-name'])

    const result = mergeRecordsWithChanges(
      originalRecords,
      [],
      editedValues,
      deletedIds,
    )

    expect(result[0]).toMatchObject({ isDeleted: true })
    expect(result[0]).not.toHaveProperty('isEdited')
  })
})

describe('createNewRecord', () => {
  it('creates a text record', () => {
    const record = createNewRecord('text', 'name', 'John')

    expect(record).toEqual({
      type: 'text',
      key: 'name',
      value: 'John',
    })
  })

  it('creates an ETH address record with coin type 60', () => {
    const record = createNewRecord('address', 'ETH', '0x123')

    expect(record).toEqual({
      type: 'address',
      key: 'ETH',
      value: '0x123',
      id: 60,
    })
  })

  it('creates a BTC address record with coin type 0', () => {
    const record = createNewRecord('address', 'btc', 'bc1...')

    expect(record).toEqual({
      type: 'address',
      key: 'btc',
      value: 'bc1...',
      id: 0,
    })
  })

  it('creates a SOL address record with correct coin type', () => {
    const record = createNewRecord(
      'address',
      'sol',
      'So11111111111111111111111111111111111111112',
    )

    expect(record).toEqual({
      type: 'address',
      key: 'sol',
      value: 'So11111111111111111111111111111111111111112',
      id: 501,
    })
  })

  it('defaults to ETH coin type (60) for unknown coin names', () => {
    const record = createNewRecord('address', 'UNKNOWN', 'someaddress')

    expect(record).toEqual({
      type: 'address',
      key: 'UNKNOWN',
      value: 'someaddress',
      id: 60,
    })
  })

  it('creates a contentHash record', () => {
    const record = createNewRecord('contentHash', '', 'ipfs://abc')

    expect(record).toEqual({
      type: 'contentHash',
      value: 'ipfs://abc',
    })
  })

  it('creates ABI as text record for now', () => {
    const record = createNewRecord('abi', 'myAbi', '[{"type":"function"}]')

    expect(record).toEqual({
      type: 'text',
      key: 'myAbi',
      value: '[{"type":"function"}]',
    })
  })
})
