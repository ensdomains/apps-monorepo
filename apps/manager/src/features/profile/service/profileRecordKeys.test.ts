import type { RecordInventory } from '@ens-apps/indexer/reads'
import { describe, expect, it } from 'vitest'
import { mainProfileRecords } from '../data/records'
import { selectProfileRecordKeys } from './profileRecordKeys'

const inventory = (
  overrides: Partial<RecordInventory> = {},
): RecordInventory => ({
  knownKeys: ['text:org.example', 'addr:2147483785'],
  unsetKeys: [],
  unsupportedKeys: [],
  abiContentTypes: [],
  ...overrides,
})

describe('selectProfileRecordKeys', () => {
  it.each([
    { state: 'no inventory', value: null, isRead: false },
    {
      state: 'inventory_not_authoritative',
      value: inventory({
        knownKeys: [],
        unsupportedKeys: ['text:org.example', 'addr:2147483785'],
        abiContentTypes: null,
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
})
