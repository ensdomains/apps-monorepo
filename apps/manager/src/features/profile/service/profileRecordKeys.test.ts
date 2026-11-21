import type { RecordInventory } from '@ens-apps/indexer/bigname'
import { describe, expect, it } from 'vitest'
import { mainProfileRecords } from '../data/records'
import {
  selectProfileRecordKeys,
  withSavedCustomTexts,
} from './profileRecordKeys'

const inventory = (
  overrides: Partial<RecordInventory> = {},
): RecordInventory => ({
  known_keys: ['text:org.example', 'addr:2147483785'],
  unset_keys: [],
  unsupported_keys: [],
  abi_content_types: [],
  ...overrides,
})

describe('selectProfileRecordKeys', () => {
  it.each([
    { state: 'no inventory', value: undefined, isRead: false },
    {
      state: 'inventory_not_authoritative',
      value: inventory({
        known_keys: [],
        unsupported_keys: ['text:org.example', 'addr:2147483785'],
        abi_content_types: null,
        abi_unsupported_reason: 'inventory_not_authoritative',
      }),
      isRead: false,
    },
    { state: 'an authoritative inventory', value: inventory(), isRead: true },
  ])(
    'reads the main keys, and indexed keys: $isRead, for $state',
    ({ value, isRead }) => {
      const keys = selectProfileRecordKeys(value)
      expect(keys.texts).toEqual(
        isRead
          ? [...mainProfileRecords.texts, 'org.example']
          : mainProfileRecords.texts,
      )
      expect(keys.coins).toEqual(
        isRead
          ? [...mainProfileRecords.coins, 2147483785]
          : mainProfileRecords.coins,
      )
    },
  )

  it('keeps reading a custom key the last fetch held before the index lists it', () => {
    const keys = selectProfileRecordKeys(inventory({ known_keys: [] }), [
      'inphinity.symbol',
      'description',
    ])

    expect(keys.texts).toEqual([
      ...mainProfileRecords.texts,
      'inphinity.symbol',
    ])
  })
})

describe('withSavedCustomTexts', () => {
  it('holds saved custom records, replacing old values and skipping blank rows', () => {
    const texts = [
      { key: 'description', value: 'Keep this' },
      { key: 'inphinity.symbol', value: 'OLD' },
    ]

    expect(
      withSavedCustomTexts(texts, [
        { key: 'inphinity.symbol', value: 'AIBLD' },
        { key: 'inphinity.index', value: '2' },
        { key: ' ', value: 'no key yet' },
        { key: 'inphinity.fee', value: '' },
      ]),
    ).toEqual([
      { key: 'description', value: 'Keep this' },
      { key: 'inphinity.symbol', value: 'AIBLD' },
      { key: 'inphinity.index', value: '2' },
    ])
  })
})
