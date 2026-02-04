import { describe, expect, it } from 'vitest'
import type { EditableRecord } from './editRecordUtils'
import {
  getRecordError,
  type ValidationError,
  validateRecord,
  validateRecords,
} from './validateRecord'

describe('validateRecord', () => {
  describe('URL validation (avatar, url, banner, header, cover)', () => {
    const urlKeys = ['avatar', 'url', 'banner', 'header', 'cover']

    for (const key of urlKeys) {
      describe(`${key} field`, () => {
        it('accepts valid https URL', () => {
          const record: EditableRecord = {
            type: 'text',
            key,
            value: 'https://example.com/image.png',
          }
          expect(validateRecord(record)).toBeNull()
        })

        it('accepts valid http URL', () => {
          const record: EditableRecord = {
            type: 'text',
            key,
            value: 'http://example.com/image.png',
          }
          expect(validateRecord(record)).toBeNull()
        })

        it('accepts valid ipfs URL', () => {
          const record: EditableRecord = {
            type: 'text',
            key,
            value: 'ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG',
          }
          expect(validateRecord(record)).toBeNull()
        })

        it('accepts valid ipns URL', () => {
          const record: EditableRecord = {
            type: 'text',
            key,
            value: 'ipns://example.eth',
          }
          expect(validateRecord(record)).toBeNull()
        })

        it('rejects invalid URL (missing protocol)', () => {
          const record: EditableRecord = {
            type: 'text',
            key,
            value: 'example.com/image.png',
          }
          expect(validateRecord(record)).toContain('Invalid URL')
        })

        it('rejects invalid URL (truncated https)', () => {
          const record: EditableRecord = {
            type: 'text',
            key,
            value: 'tps://example.com/image.png',
          }
          expect(validateRecord(record)).toContain('Invalid URL')
        })

        it('accepts empty value (deletion)', () => {
          const record: EditableRecord = {
            type: 'text',
            key,
            value: '',
          }
          expect(validateRecord(record)).toBeNull()
        })
      })
    }
  })

  describe('email validation', () => {
    it('accepts valid email', () => {
      const record: EditableRecord = {
        type: 'text',
        key: 'email',
        value: 'user@example.com',
      }
      expect(validateRecord(record)).toBeNull()
    })

    it('rejects invalid email (missing @)', () => {
      const record: EditableRecord = {
        type: 'text',
        key: 'email',
        value: 'userexample.com',
      }
      expect(validateRecord(record)).toContain('Invalid email')
    })

    it('rejects invalid email (missing domain)', () => {
      const record: EditableRecord = {
        type: 'text',
        key: 'email',
        value: 'user@',
      }
      expect(validateRecord(record)).toContain('Invalid email')
    })

    it('accepts empty value (deletion)', () => {
      const record: EditableRecord = {
        type: 'text',
        key: 'email',
        value: '',
      }
      expect(validateRecord(record)).toBeNull()
    })
  })

  describe('address validation (ETH)', () => {
    it('accepts valid ETH address', () => {
      const record: EditableRecord = {
        type: 'address',
        key: 'ETH',
        value: '0x1234567890123456789012345678901234567890',
        id: 60,
      }
      expect(validateRecord(record)).toBeNull()
    })

    it('rejects invalid ETH address (too short)', () => {
      const record: EditableRecord = {
        type: 'address',
        key: 'ETH',
        value: '0x1234',
        id: 60,
      }
      expect(validateRecord(record)).toContain('Invalid Ethereum address')
    })

    it('rejects invalid ETH address (missing 0x prefix)', () => {
      const record: EditableRecord = {
        type: 'address',
        key: 'ETH',
        value: '1234567890123456789012345678901234567890',
        id: 60,
      }
      expect(validateRecord(record)).toContain('Invalid Ethereum address')
    })

    it('accepts empty value (deletion)', () => {
      const record: EditableRecord = {
        type: 'address',
        key: 'ETH',
        value: '',
        id: 60,
      }
      expect(validateRecord(record)).toBeNull()
    })

    it('skips validation for non-ETH addresses', () => {
      const record: EditableRecord = {
        type: 'address',
        key: 'BTC',
        value: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',
        id: 0, // BTC coinType
      }
      expect(validateRecord(record)).toBeNull()
    })
  })

  describe('text records without special validation', () => {
    it('accepts any value for non-validated text keys', () => {
      const record: EditableRecord = {
        type: 'text',
        key: 'description',
        value: 'any value is fine here',
      }
      expect(validateRecord(record)).toBeNull()
    })
  })

  describe('deleted records', () => {
    it('skips validation for deleted records', () => {
      const record: EditableRecord = {
        type: 'text',
        key: 'avatar',
        value: 'invalid-url',
        isDeleted: true,
      }
      expect(validateRecord(record)).toBeNull()
    })
  })
})

describe('validateRecords', () => {
  it('returns empty array when all records are valid', () => {
    const records: EditableRecord[] = [
      {
        type: 'text',
        key: 'avatar',
        value: 'https://example.com/img.png',
        isEdited: true,
      },
      { type: 'text', key: 'name', value: 'John', isNew: true },
    ]
    expect(validateRecords(records)).toEqual([])
  })

  it('returns errors for invalid records', () => {
    const records: EditableRecord[] = [
      { type: 'text', key: 'avatar', value: 'invalid-url', isEdited: true },
      { type: 'text', key: 'email', value: 'invalid-email', isNew: true },
    ]
    const errors = validateRecords(records)
    expect(errors).toHaveLength(2)
    expect(errors[0].recordId).toBe('text-avatar')
    expect(errors[1].recordId).toBe('text-email')
  })

  it('only validates edited or new records', () => {
    const records: EditableRecord[] = [
      { type: 'text', key: 'avatar', value: 'invalid-url' }, // not edited, not new
      { type: 'text', key: 'email', value: 'invalid-email', isEdited: true },
    ]
    const errors = validateRecords(records)
    expect(errors).toHaveLength(1)
    expect(errors[0].recordId).toBe('text-email')
  })
})

describe('getRecordError', () => {
  const errors: ValidationError[] = [
    { recordId: 'text-avatar', message: 'Invalid URL' },
    { recordId: 'text-email', message: 'Invalid email' },
  ]

  it('returns error message for matching recordId', () => {
    expect(getRecordError(errors, 'text-avatar')).toBe('Invalid URL')
  })

  it('returns undefined for non-matching recordId', () => {
    expect(getRecordError(errors, 'text-name')).toBeUndefined()
  })
})
