import { describe, expect, it } from 'vitest'
import {
  ALL_EDITABLE_TYPES,
  type EditableRecord,
  NO_EDITABLE_TYPES,
} from '@/utils/records/editRecordUtils'
import {
  getAvailableTextRecordKeys,
  searchEditableAddressRecords,
  searchEditableTextRecords,
} from './recordCatalog'

describe('searchEditableTextRecords', () => {
  it('suggests only the text keys the wallet may write', () => {
    const editableTypes = {
      ...NO_EDITABLE_TYPES,
      text: new Set(['avatar', 'com.github', 'custom.key']),
    }

    expect(
      searchEditableTextRecords(editableTypes, '', []).map(({ key }) => key),
    ).toEqual(['avatar', 'com.github'])
  })

  it('hides saved and staged text keys but offers a key marked for deletion', () => {
    const records: readonly EditableRecord[] = [
      { type: 'text', key: 'com.twitter', value: 'saved' },
      { type: 'text', key: 'com.discord', value: 'draft', isNew: true },
      { type: 'text', key: 'com.github', value: 'old', isDeleted: true },
    ]

    const keys = searchEditableTextRecords(ALL_EDITABLE_TYPES, '', records).map(
      ({ key }) => key,
    )

    expect(keys).not.toContain('com.twitter')
    expect(keys).not.toContain('com.discord')
    expect(keys).toContain('com.github')
  })
})

describe('searchEditableAddressRecords', () => {
  it('suggests only the coin types the wallet may write', () => {
    const editableTypes = {
      ...NO_EDITABLE_TYPES,
      address: new Set([0n, 2147492101n]),
    }

    expect(
      searchEditableAddressRecords(editableTypes, '', []).map(
        ({ coinType }) => coinType,
      ),
    ).toEqual([0, 2147492101])
  })

  it('hides a saved coin type regardless of its row label and retains distinct IDs', () => {
    const records: readonly EditableRecord[] = [
      { type: 'address', key: 'ETH', id: 60, value: '0xsaved' },
      {
        type: 'address',
        key: 'BASE',
        id: 2147492101,
        value: '0xdraft',
        isNew: true,
      },
      { type: 'address', key: 'BTC', id: 0, value: 'old', isDeleted: true },
    ]
    const editableTypes = {
      ...NO_EDITABLE_TYPES,
      address: new Set([0n, 60n, 2147492101n, 2147568180n]),
    }

    expect(
      searchEditableAddressRecords(editableTypes, '', records).map(
        ({ coinType }) => coinType,
      ),
    ).toEqual([0, 2147568180])
  })
})

describe('getAvailableTextRecordKeys', () => {
  it('keeps permitted custom keys and treats keys as case-sensitive', () => {
    const keys = new Set(['custom.key', 'Avatar', 'avatar'])
    const records: readonly EditableRecord[] = [
      { type: 'text', key: 'avatar', value: 'saved' },
    ]

    expect(getAvailableTextRecordKeys(keys, records)).toEqual([
      'Avatar',
      'custom.key',
    ])
  })
})
