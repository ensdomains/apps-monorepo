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

  describe('contentHash validation', () => {
    it('accepts valid ipfs:// contentHash', () => {
      const record: EditableRecord = {
        type: 'contentHash',
        value: 'ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG',
      }
      expect(validateRecord(record)).toBeNull()
    })

    it('accepts valid ipns:// contentHash', () => {
      const record: EditableRecord = {
        type: 'contentHash',
        value:
          'ipns://k51qzi5uqu5dlvj2baxnqndepeb86cbk3ng7n3i46uzyxzyqj2xjonzllnv0v8',
      }
      expect(validateRecord(record)).toBeNull()
    })

    it('accepts valid ar:// contentHash', () => {
      const record: EditableRecord = {
        type: 'contentHash',
        value: 'ar://AJTUmYd9bpE5n1RFVKjqXqJnlQsXnCzq1bYs9p3nG-8',
      }
      expect(validateRecord(record)).toBeNull()
    })

    it('accepts valid onion:// contentHash', () => {
      const record: EditableRecord = {
        type: 'contentHash',
        value:
          'onion://zqktlwiuavvvqqt4ygvvdqefrmhhl3zvngymcmupejn26kspgibb2dad',
      }
      expect(validateRecord(record)).toBeNull()
    })

    it('accepts valid sia:// contentHash', () => {
      const record: EditableRecord = {
        type: 'contentHash',
        value: 'sia://AAABWPJDX9GGQD1M_H0YRPCY3XEXPHBXRP5PWCXR5RD6MTAFGQ',
      }
      expect(validateRecord(record)).toBeNull()
    })

    it('rejects contentHash with unsupported protocol', () => {
      const record: EditableRecord = {
        type: 'contentHash',
        value: 'ftp://example.com/file.txt',
      }
      expect(validateRecord(record)).toContain('Invalid contentHash')
    })

    it('rejects contentHash without protocol', () => {
      const record: EditableRecord = {
        type: 'contentHash',
        value: 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG',
      }
      expect(validateRecord(record)).toContain('Invalid contentHash')
    })

    it('rejects contentHash with only protocol (no identifier)', () => {
      const record: EditableRecord = {
        type: 'contentHash',
        value: 'ipfs://',
      }
      expect(validateRecord(record)).toContain('Invalid contentHash')
    })

    it('accepts empty value (deletion)', () => {
      const record: EditableRecord = {
        type: 'contentHash',
        value: '',
      }
      expect(validateRecord(record)).toBeNull()
    })
  })

  describe('ABI validation', () => {
    it('accepts valid JSON object', () => {
      const record: EditableRecord = {
        type: 'abi',
        value: '{"name":"test","type":"function","inputs":[]}',
      }
      expect(validateRecord(record)).toBeNull()
    })

    it('accepts valid JSON array', () => {
      const record: EditableRecord = {
        type: 'abi',
        value: '[{"name":"test","type":"function","inputs":[]}]',
      }
      expect(validateRecord(record)).toBeNull()
    })

    it('rejects invalid JSON', () => {
      const record: EditableRecord = {
        type: 'abi',
        value: '{ "test": "value"',
      }
      expect(validateRecord(record)).toContain('Invalid JSON')
    })

    it('rejects non-JSON string', () => {
      const record: EditableRecord = {
        type: 'abi',
        value: 'not json at all',
      }
      expect(validateRecord(record)).toContain('Invalid JSON')
    })

    it('accepts empty value (deletion)', () => {
      const record: EditableRecord = {
        type: 'abi',
        value: '',
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

  it('uses key (not coinType) for address recordIds to ensure uniqueness', () => {
    const records: EditableRecord[] = [
      { type: 'address', key: 'ETH', value: 'invalid', id: 60, isNew: true },
      {
        type: 'address',
        key: 'UNKNOWN',
        value: 'also-invalid',
        id: 60,
        isNew: true,
      },
    ]
    const errors = validateRecords(records)
    expect(errors).toHaveLength(2)
    // Should use key, not coinType, so each record has a unique recordId
    expect(errors[0].recordId).toBe('address-ETH')
    expect(errors[1].recordId).toBe('address-UNKNOWN')
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
