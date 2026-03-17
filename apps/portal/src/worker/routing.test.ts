import { describe, expect, it } from 'vitest'
import {
  extractAddrFromPath,
  extractNameFromPath,
  isAddressRoute,
  isAddrSubpage,
  STATIC_PATH_PREFIXES,
  truncate,
} from './routing'

describe('routing', () => {
  describe('STATIC_PATH_PREFIXES', () => {
    it('should contain expected static path prefixes', () => {
      expect(STATIC_PATH_PREFIXES).toContain('/assets/')
      expect(STATIC_PATH_PREFIXES).toContain('/og/')
      expect(STATIC_PATH_PREFIXES).toContain('/addr/')
      expect(STATIC_PATH_PREFIXES).toContain('/favicon')
      expect(STATIC_PATH_PREFIXES).toContain('/manifest')
      expect(STATIC_PATH_PREFIXES).toContain('/logo')
    })
  })

  describe('isAddressRoute', () => {
    it('should return true for valid address route', () => {
      expect(
        isAddressRoute('/addr/0x1234567890abcdef1234567890abcdef12345678'),
      ).toBe(true)
    })

    it('should return true for address with uppercase hex', () => {
      expect(
        isAddressRoute('/addr/0xABCDEF1234567890ABCDEF1234567890ABCDEF12'),
      ).toBe(true)
    })

    it('should return false for address with subpage', () => {
      expect(
        isAddressRoute(
          '/addr/0x1234567890abcdef1234567890abcdef12345678/names',
        ),
      ).toBe(false)
    })

    it('should return false for address with invalid length', () => {
      expect(isAddressRoute('/addr/0x1234567890abcdef')).toBe(false)
    })

    it('should return false for non-address route', () => {
      expect(isAddressRoute('/nick.eth')).toBe(false)
    })

    it('should return false for root path', () => {
      expect(isAddressRoute('/')).toBe(false)
    })
  })

  describe('isAddrSubpage', () => {
    it('should return true for address with names subpage', () => {
      expect(
        isAddrSubpage('/addr/0x1234567890abcdef1234567890abcdef12345678/names'),
      ).toBe(true)
    })

    it('should return true for address with history subpage', () => {
      expect(
        isAddrSubpage(
          '/addr/0x1234567890abcdef1234567890abcdef12345678/history',
        ),
      ).toBe(true)
    })

    it('should return true for address with reverse-resolution subpage', () => {
      expect(
        isAddrSubpage(
          '/addr/0x1234567890abcdef1234567890abcdef12345678/reverse-resolution',
        ),
      ).toBe(true)
    })

    it('should return false for plain address route', () => {
      expect(
        isAddrSubpage('/addr/0x1234567890abcdef1234567890abcdef12345678'),
      ).toBe(false)
    })

    it('should return false for nested subpage', () => {
      expect(
        isAddrSubpage(
          '/addr/0x1234567890abcdef1234567890abcdef12345678/foo/bar',
        ),
      ).toBe(false)
    })
  })

  describe('extractAddrFromPath', () => {
    it('should extract address from plain address route', () => {
      const result = extractAddrFromPath(
        '/addr/0x1234567890abcdef1234567890abcdef12345678',
      )
      expect(result).toBe('0x1234567890abcdef1234567890abcdef12345678')
    })

    it('should extract address from address with subpage', () => {
      const result = extractAddrFromPath(
        '/addr/0x1234567890abcdef1234567890abcdef12345678/names',
      )
      expect(result).toBe('0x1234567890abcdef1234567890abcdef12345678')
    })

    it('should return null for invalid address', () => {
      expect(extractAddrFromPath('/addr/invalid')).toBeNull()
    })

    it('should return null for non-address route', () => {
      expect(extractAddrFromPath('/nick.eth')).toBeNull()
    })
  })

  describe('extractNameFromPath', () => {
    it('should extract simple ENS name', () => {
      expect(extractNameFromPath('/nick.eth')).toBe('nick.eth')
    })

    it('should extract name with subpage', () => {
      expect(extractNameFromPath('/nick.eth/ownership')).toBe('nick.eth')
    })

    it('should extract name with nested subpage', () => {
      expect(extractNameFromPath('/nick.eth/records/some-record')).toBe(
        'nick.eth',
      )
    })

    it('should return null for static paths', () => {
      expect(extractNameFromPath('/assets/script.js')).toBeNull()
      expect(extractNameFromPath('/og/test.png')).toBeNull()
      expect(extractNameFromPath('/favicon.ico')).toBeNull()
      expect(extractNameFromPath('/manifest.json')).toBeNull()
      expect(extractNameFromPath('/logo.svg')).toBeNull()
    })

    it('should return null for paths without leading slash', () => {
      expect(extractNameFromPath('nick.eth')).toBeNull()
    })

    it('should return null for root path', () => {
      expect(extractNameFromPath('/')).toBeNull()
    })

    it('should return null for empty path', () => {
      expect(extractNameFromPath('')).toBeNull()
    })

    it('should return null for names with invalid TLD', () => {
      expect(extractNameFromPath('/nick.com')).toBeNull()
      expect(extractNameFromPath('/nick.io')).toBeNull()
    })

    it('should return name for .eth names', () => {
      expect(extractNameFromPath('/test.eth')).toBe('test.eth')
      expect(extractNameFromPath('/long-name.eth')).toBe('long-name.eth')
    })

    it('should return null for address routes', () => {
      expect(
        extractNameFromPath('/addr/0x1234567890abcdef1234567890abcdef12345678'),
      ).toBeNull()
    })

    it('should handle encoded names', () => {
      expect(extractNameFromPath('/test%20name.eth')).toBe('test%20name.eth')
    })
  })

  describe('truncate', () => {
    it('should not truncate short text', () => {
      expect(truncate('hello', 10)).toBe('hello')
    })

    it('should truncate long text with ellipsis', () => {
      expect(truncate('hello world', 8)).toBe('hello w…')
    })

    it('should handle exact length', () => {
      expect(truncate('hello', 5)).toBe('hello')
    })

    it('should handle maxLength of 1', () => {
      expect(truncate('hello', 1)).toBe('…')
    })

    it('should handle empty string', () => {
      expect(truncate('', 5)).toBe('')
    })

    it('should handle text shorter than maxLength', () => {
      expect(truncate('hi', 10)).toBe('hi')
    })
  })
})
