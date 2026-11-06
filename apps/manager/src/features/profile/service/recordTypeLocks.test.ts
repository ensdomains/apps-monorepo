import { describe, expect, it } from 'vitest'
import {
  type EditableRecordTypes,
  getLockedRecordTypes,
  hasEditableRecordType,
  NO_EDITABLE_RECORD_TYPES,
} from './recordTypeLocks'

const LOCKED_ADDRESS: EditableRecordTypes = {
  text: true,
  address: false,
  contentHash: true,
  abi: true,
}

describe('getLockedRecordTypes', () => {
  it.each([
    {
      case: 'locks the types the wallet cannot write',
      editableTypes: LOCKED_ADDRESS,
      isReplacingResolver: false,
      expected: ['address'],
    },
    {
      case: 'locks nothing while access is unknown',
      editableTypes: undefined,
      isReplacingResolver: false,
      expected: [],
    },
    {
      case: 'locks nothing when records move to a new resolver',
      editableTypes: NO_EDITABLE_RECORD_TYPES,
      isReplacingResolver: true,
      expected: [],
    },
  ])('$case', ({ editableTypes, isReplacingResolver, expected }) => {
    expect([
      ...getLockedRecordTypes({ editableTypes, isReplacingResolver }),
    ]).toEqual(expected)
  })
})

describe('hasEditableRecordType', () => {
  it.each([
    { types: NO_EDITABLE_RECORD_TYPES, expected: false },
    { types: { ...NO_EDITABLE_RECORD_TYPES, abi: true }, expected: true },
  ])('is $expected for $types', ({ types, expected }) => {
    expect(hasEditableRecordType(types)).toBe(expected)
  })
})
