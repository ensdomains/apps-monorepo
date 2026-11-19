import { describe, expect, it } from 'vitest'
import { NO_EDITABLE_TYPES } from '@/utils/records/editRecordUtils'
import {
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
      searchEditableTextRecords(editableTypes, '').map(({ key }) => key),
    ).toEqual(['avatar', 'com.github'])
  })
})

describe('searchEditableAddressRecords', () => {
  it('suggests only the coin types the wallet may write', () => {
    const editableTypes = {
      ...NO_EDITABLE_TYPES,
      address: new Set([0n, 2147492101n]),
    }

    expect(
      searchEditableAddressRecords(editableTypes, '').map(
        ({ coinType }) => coinType,
      ),
    ).toEqual([0, 2147492101])
  })
})
