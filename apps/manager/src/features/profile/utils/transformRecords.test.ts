import { describe, expect, it } from 'vitest'
import {
  newEmptyProfileRecords,
  transformToServiceFormat,
} from './transformRecords'

describe('profile transformRecords utils', () => {
  describe('newEmptyProfileRecords', () => {
    it('should create empty profile records with all sections', () => {
      const records = newEmptyProfileRecords()

      expect(records.base).toEqual({})
      expect(records.addresses).toEqual([])
      expect(records.links).toEqual([])
      expect(records.unknown).toEqual([])
    })

    it('should have empty arrays for all section types', () => {
      const records = newEmptyProfileRecords()

      expect(Array.isArray(records.addresses)).toBe(true)
      expect(Array.isArray(records.links)).toBe(true)
      expect(Array.isArray(records.unknown)).toBe(true)
    })

    it('should create a new object each time', () => {
      const records1 = newEmptyProfileRecords()
      const records2 = newEmptyProfileRecords()

      expect(records1).not.toBe(records2)
      expect(records1.base).not.toBe(records2.base)
      expect(records1.addresses).not.toBe(records2.addresses)
    })
  })

  describe('transformToServiceFormat', () => {
    it('should transform empty records to service format', () => {
      const records = newEmptyProfileRecords()
      const result = transformToServiceFormat(records)

      // newEmptyProfileRecords includes default section fields with empty values
      expect(result.texts).toEqual([
        { key: 'com.twitter', value: '' },
        { key: 'org.telegram', value: '' },
        { key: 'email', value: '' },
        { key: 'location', value: '' },
      ])
      expect(result.coins).toEqual([])
    })

    it('should transform base records to texts', () => {
      const records = {
        ...newEmptyProfileRecords(),
        base: {
          description: 'Test description',
          avatar: 'https://example.com/avatar.png',
        },
      }

      const result = transformToServiceFormat(records)

      expect(result.texts).toContainEqual({
        key: 'description',
        value: 'Test description',
      })
      expect(result.texts).toContainEqual({
        key: 'avatar',
        value: 'https://example.com/avatar.png',
      })
    })

    it('should transform addresses to coins', () => {
      const records = {
        ...newEmptyProfileRecords(),
        addresses: [
          { coinType: 60, value: '0x1234567890abcdef' },
          { coinType: 0, value: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa' },
        ],
      }

      const result = transformToServiceFormat(records)

      expect(result.coins).toContainEqual({
        coinType: 60,
        value: '0x1234567890abcdef',
      })
      expect(result.coins).toContainEqual({
        coinType: 0,
        value: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
      })
    })

    it('should filter out empty address values', () => {
      const records = {
        ...newEmptyProfileRecords(),
        addresses: [
          { coinType: 60, value: '0x1234567890abcdef' },
          { coinType: 0, value: '' },
          { coinType: 1, value: '   ' },
        ],
      }

      const result = transformToServiceFormat(records)

      expect(result.coins).toHaveLength(1)
      expect(result.coins[0]).toEqual({
        coinType: 60,
        value: '0x1234567890abcdef',
      })
    })

    it('should transform links to JSON string', () => {
      const records = {
        ...newEmptyProfileRecords(),
        links: [
          { name: 'Website', url: 'https://example.com' },
          { name: 'Blog', url: 'https://blog.example.com' },
        ],
      }

      const result = transformToServiceFormat(records)

      const linksText = result.texts.find((t) => t.key === 'links')
      expect(linksText).toBeDefined()
      expect(linksText?.value).toBe(JSON.stringify(records.links))
    })

    it('should not include links when array is empty', () => {
      const records = {
        ...newEmptyProfileRecords(),
        links: [],
      }

      const result = transformToServiceFormat(records)

      const linksText = result.texts.find((t) => t.key === 'links')
      expect(linksText).toBeUndefined()
    })

    it('should transform unknown records', () => {
      const records = {
        ...newEmptyProfileRecords(),
        unknown: [
          { key: 'custom.field', value: 'custom value' },
          { key: 'another.custom', value: 'another value' },
        ],
      }

      const result = transformToServiceFormat(records)

      expect(result.texts).toContainEqual({
        key: 'custom.field',
        value: 'custom value',
      })
      expect(result.texts).toContainEqual({
        key: 'another.custom',
        value: 'another value',
      })
    })

    it('should combine all text types', () => {
      const records = {
        ...newEmptyProfileRecords(),
        base: {
          description: 'Test',
        },
        unknown: [{ key: 'custom', value: 'value' }],
        links: [{ name: 'Link', url: 'https://example.com' }],
      }

      const result = transformToServiceFormat(records)

      expect(result.texts.length).toBeGreaterThanOrEqual(3)
    })

    it('should handle null and undefined values gracefully', () => {
      const records = {
        ...newEmptyProfileRecords(),
        addresses: [
          { coinType: 60, value: '0x1234' },
          { coinType: 0, value: null as unknown as string },
          { coinType: 1, value: undefined as unknown as string },
        ],
      }

      const result = transformToServiceFormat(records)

      expect(result.coins).toHaveLength(1)
    })
  })
})
