import type { RecordInventory } from '@ens-apps/indexer/bigname'
import { describe, expect, it } from 'vitest'
import { offchainProfileRecords } from '../data/records'
import {
  selectProfileRecordKeys,
  shouldCheckOffchain,
} from './profileRecordKeys'

const inventory = (
  overrides: Partial<RecordInventory> = {},
): RecordInventory => ({
  known_keys: ['text:org.example', 'addr:2147483658'],
  unset_keys: [],
  unsupported_keys: [],
  abi_content_types: [],
  ...overrides,
})
const notAuthoritative = inventory({
  known_keys: [],
  unsupported_keys: ['text:org.example', 'addr:2147483658'],
  abi_content_types: null,
  abi_unsupported_reason: 'inventory_not_authoritative',
})

describe('shouldCheckOffchain', () => {
  it.each([
    { state: 'no inventory', value: undefined, expected: true },
    {
      state: 'inventory_not_available',
      value: inventory({
        known_keys: [],
        abi_content_types: null,
        abi_unsupported_reason: 'inventory_not_available',
      }),
      expected: true,
    },
    {
      state: 'inventory_not_authoritative',
      value: notAuthoritative,
      expected: true,
    },
    {
      state: 'an authoritative inventory with no keys',
      value: inventory({ known_keys: [] }),
      expected: true,
    },
    {
      state: 'an authoritative inventory with keys',
      value: inventory(),
      expected: false,
    },
    {
      state: 'keys whose ABI types cannot be listed',
      value: inventory({
        abi_content_types: null,
        abi_unsupported_reason: 'abi_observations_stale',
      }),
      expected: false,
    },
  ])('is $expected for $state', ({ value, expected }) => {
    expect(shouldCheckOffchain(value)).toBe(expected)
  })
})

describe('selectProfileRecordKeys', () => {
  it('reads only the profile keys through a gateway', () => {
    expect(
      selectProfileRecordKeys({ inventory: inventory(), isOffchain: true }),
    ).toBe(offchainProfileRecords)
  })

  it.each([
    { state: 'authoritative', value: inventory(), isRead: true },
    { state: 'not authoritative', value: notAuthoritative, isRead: false },
  ])(
    'reads indexed keys onchain only when the inventory is $state',
    ({ value, isRead }) => {
      const keys = selectProfileRecordKeys({
        inventory: value,
        isOffchain: false,
      })
      expect(keys.texts.includes('org.example')).toBe(isRead)
      expect(keys.coins.includes(2147483658)).toBe(isRead)
      expect(keys.texts).toContain('description')
    },
  )
})
