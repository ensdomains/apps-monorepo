import { describe, expect, it } from 'vitest'
import type { NameRecord } from '@/features/records/components/RecordsTable/columns'
import type { EditableRecord } from '@/utils/records/editRecordUtils'
import {
  type SetRecordsInput,
  transformPendingChangesToSetRecords,
} from './transformPendingChanges'

describe('transformPendingChangesToSetRecords', () => {
  const originalRecords: NameRecord[] = [
    { type: 'text', key: 'name', value: 'John' },
    { type: 'text', key: 'description', value: 'Hello' },
    { type: 'address', key: 'ETH', value: '0x123', id: 60 },
    { type: 'contentHash', value: 'ipfs://abc' },
  ]

  describe('new records', () => {
    it('transforms new text records', () => {
      const result = transformPendingChangesToSetRecords(originalRecords, {
        newRecords: [{ type: 'text', key: 'twitter', value: '@ens' }],
        editedValues: new Map(),
        deletedIds: new Set(),
      })

      expect(result.texts).toEqual([{ key: 'twitter', value: '@ens' }])
    })

    it('transforms new address records', () => {
      const result = transformPendingChangesToSetRecords(originalRecords, {
        newRecords: [{ type: 'address', key: 'BTC', value: 'bc1...', id: 0 }],
        editedValues: new Map(),
        deletedIds: new Set(),
      })

      expect(result.coins).toEqual([{ coin: 0, value: 'bc1...' }])
    })

    it('transforms new contentHash record', () => {
      const result = transformPendingChangesToSetRecords([], {
        newRecords: [{ type: 'contentHash', value: 'ipfs://new' }],
        editedValues: new Map(),
        deletedIds: new Set(),
      })

      expect(result.contentHash).toBe('ipfs://new')
    })
  })

  describe('edited records', () => {
    it('transforms edited text records', () => {
      const result = transformPendingChangesToSetRecords(originalRecords, {
        newRecords: [],
        editedValues: new Map([['text-name', 'Jane']]),
        deletedIds: new Set(),
      })

      expect(result.texts).toEqual([{ key: 'name', value: 'Jane' }])
    })

    it('transforms edited address records', () => {
      const result = transformPendingChangesToSetRecords(originalRecords, {
        newRecords: [],
        editedValues: new Map([['address-ETH', '0x456']]),
        deletedIds: new Set(),
      })

      expect(result.coins).toEqual([{ coin: 60, value: '0x456' }])
    })

    it('transforms edited contentHash', () => {
      const result = transformPendingChangesToSetRecords(originalRecords, {
        newRecords: [],
        editedValues: new Map([['contentHash', 'ipfs://updated']]),
        deletedIds: new Set(),
      })

      expect(result.contentHash).toBe('ipfs://updated')
    })
  })

  describe('deleted records', () => {
    it('transforms deleted text records to empty string', () => {
      const result = transformPendingChangesToSetRecords(originalRecords, {
        newRecords: [],
        editedValues: new Map(),
        deletedIds: new Set(['text-description']),
      })

      expect(result.texts).toEqual([{ key: 'description', value: '' }])
    })

    it('transforms deleted address records to empty string', () => {
      const result = transformPendingChangesToSetRecords(originalRecords, {
        newRecords: [],
        editedValues: new Map(),
        deletedIds: new Set(['address-ETH']),
      })

      expect(result.coins).toEqual([{ coin: 60, value: '' }])
    })

    it('transforms deleted contentHash to null', () => {
      const result = transformPendingChangesToSetRecords(originalRecords, {
        newRecords: [],
        editedValues: new Map(),
        deletedIds: new Set(['contentHash']),
      })

      expect(result.contentHash).toBeNull()
    })
  })

  describe('combined changes', () => {
    it('handles multiple changes at once', () => {
      const result = transformPendingChangesToSetRecords(originalRecords, {
        newRecords: [{ type: 'text', key: 'twitter', value: '@ens' }],
        editedValues: new Map([['text-name', 'Jane']]),
        deletedIds: new Set(['text-description']),
      })

      expect(result.texts).toEqual([
        { key: 'description', value: '' },
        { key: 'name', value: 'Jane' },
        { key: 'twitter', value: '@ens' },
      ])
    })

    it('returns empty object when no changes', () => {
      const result = transformPendingChangesToSetRecords(originalRecords, {
        newRecords: [],
        editedValues: new Map(),
        deletedIds: new Set(),
      })

      expect(result).toEqual({})
    })
  })

  describe('same-key replacement', () => {
    const records: NameRecord[] = [
      { type: 'text', key: 'url', value: 'https://old.example' },
      { type: 'address', key: 'base', value: '0xold', id: 2147492101 },
      { type: 'contentHash', value: 'ipfs://old' },
      { type: 'abi', value: '{"old":true}' },
    ]
    const replacements = [
      {
        id: 'text-url',
        record: { type: 'text', key: 'url', value: 'https://new.example' },
        pick: (r: SetRecordsInput) => r.texts,
        expected: [{ key: 'url', value: 'https://new.example' }],
        cleared: [{ key: 'url', value: '' }],
      },
      {
        id: 'address-base',
        record: {
          type: 'address',
          key: 'base',
          value: '0xnew',
          id: 2147492101,
        },
        pick: (r: SetRecordsInput) => r.coins,
        expected: [{ coin: 2147492101, value: '0xnew' }],
        cleared: [{ coin: 2147492101, value: '' }],
      },
      {
        id: 'contentHash',
        record: { type: 'contentHash', value: 'ipfs://new' },
        pick: (r: SetRecordsInput) => r.contentHash,
        expected: 'ipfs://new',
        cleared: null,
      },
      {
        id: 'abi',
        record: { type: 'abi', value: '{"new":true}' },
        pick: (r: SetRecordsInput) => r.abi,
        expected: { encodeAs: 'json', data: { new: true } },
        cleared: { encodeAs: 'json', data: null },
      },
    ] as const satisfies ReadonlyArray<{
      id: string
      record: EditableRecord
      pick: (r: SetRecordsInput) => unknown
      expected: unknown
      cleared: unknown
    }>

    it.each(
      replacements,
    )('coalesces a delete plus an add of $id into one set of the new value', ({
      id,
      record,
      pick,
      expected,
    }) => {
      const result = transformPendingChangesToSetRecords(records, {
        newRecords: [{ ...record, _uid: 'new' }],
        editedValues: new Map(),
        deletedIds: new Set([id]),
      })

      expect(pick(result)).toEqual(expected)
    })

    it.each(replacements)('serialises a lone delete of $id as one clear', ({
      id,
      pick,
      cleared,
    }) => {
      const result = transformPendingChangesToSetRecords(records, {
        newRecords: [],
        editedValues: new Map(),
        deletedIds: new Set([id]),
      })

      expect(pick(result)).toEqual(cleared)
    })

    it('never emits a clear after a set, and orders clears before sets', () => {
      const result = transformPendingChangesToSetRecords(
        [
          ...records,
          { type: 'text', key: 'email', value: 'a@b.c' },
          { type: 'address', key: 'eth', value: '0xeth', id: 60 },
        ],
        {
          newRecords: [
            { type: 'text', key: 'url', value: 'https://new.example' },
            { type: 'address', key: 'base', value: '0xnew', id: 2147492101 },
          ],
          editedValues: new Map(),
          deletedIds: new Set([
            'text-url',
            'address-base',
            'text-email',
            'address-eth',
          ]),
        },
      )

      expect(result.texts).toEqual([
        { key: 'email', value: '' },
        { key: 'url', value: 'https://new.example' },
      ])
      expect(result.coins).toEqual([
        { coin: 60, value: '' },
        { coin: 2147492101, value: '0xnew' },
      ])
    })
  })

  describe('ABI records', () => {
    it('transforms new ABI record with valid JSON object', () => {
      const result = transformPendingChangesToSetRecords([], {
        newRecords: [{ type: 'abi', value: '{"name":"test"}' }],
        editedValues: new Map(),
        deletedIds: new Set(),
      })

      expect(result.abi).toEqual({ encodeAs: 'json', data: { name: 'test' } })
    })

    it('transforms new ABI record with valid JSON array', () => {
      const result = transformPendingChangesToSetRecords([], {
        newRecords: [{ type: 'abi', value: '[{"name":"test"}]' }],
        editedValues: new Map(),
        deletedIds: new Set(),
      })

      expect(result.abi).toEqual({ encodeAs: 'json', data: [{ name: 'test' }] })
    })

    it('transforms edited ABI record', () => {
      const recordsWithAbi: NameRecord[] = [
        { type: 'abi', value: '{"old":"value"}' },
      ]

      const result = transformPendingChangesToSetRecords(recordsWithAbi, {
        newRecords: [],
        editedValues: new Map([['abi', '{"new":"value"}']]),
        deletedIds: new Set(),
      })

      expect(result.abi).toEqual({ encodeAs: 'json', data: { new: 'value' } })
    })

    it('transforms deleted ABI record to null', () => {
      const recordsWithAbi: NameRecord[] = [
        { type: 'abi', value: '{"test":"value"}' },
      ]

      const result = transformPendingChangesToSetRecords(recordsWithAbi, {
        newRecords: [],
        editedValues: new Map(),
        deletedIds: new Set(['abi']),
      })

      expect(result.abi).toEqual({ encodeAs: 'json', data: null })
    })

    it('handles empty ABI value as null', () => {
      const result = transformPendingChangesToSetRecords([], {
        newRecords: [{ type: 'abi', value: '' }],
        editedValues: new Map(),
        deletedIds: new Set(),
      })

      expect(result.abi).toEqual({ encodeAs: 'json', data: null })
    })

    it('does not include ABI with invalid JSON', () => {
      const result = transformPendingChangesToSetRecords([], {
        newRecords: [{ type: 'abi', value: 'not valid json' }],
        editedValues: new Map(),
        deletedIds: new Set(),
      })

      // Invalid JSON is silently skipped (returns undefined from parseAbiValue)
      expect(result.abi).toBeUndefined()
    })
  })

  describe('edge cases', () => {
    it('ignores edited records not found in original', () => {
      const result = transformPendingChangesToSetRecords(originalRecords, {
        newRecords: [],
        editedValues: new Map([['text-nonexistent', 'value']]),
        deletedIds: new Set(),
      })

      expect(result).toEqual({})
    })

    it('ignores deleted records not found in original', () => {
      const result = transformPendingChangesToSetRecords(originalRecords, {
        newRecords: [],
        editedValues: new Map(),
        deletedIds: new Set(['text-nonexistent']),
      })

      expect(result).toEqual({})
    })
  })
})
