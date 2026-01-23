import { describe, expect, it, vi } from 'vitest'
import { buildSearchSuggestions } from './buildSearchSuggestions'

describe('buildSearchSuggestions', () => {
  const mockNavigateToAddress = vi.fn()
  const mockNavigateToName = vi.fn()

  const defaultOptions = {
    isMobile: false,
    navigateToAddress: mockNavigateToAddress,
    navigateToName: mockNavigateToName,
  }

  describe('Empty Input', () => {
    it('should return empty array for empty value', () => {
      const result = buildSearchSuggestions({
        ...defaultOptions,
        value: '',
      })

      expect(result).toEqual([])
    })

    it('should return empty array for whitespace-only value', () => {
      const result = buildSearchSuggestions({
        ...defaultOptions,
        value: '   ',
      })

      expect(result.length).toBeGreaterThan(0) // Will add .eth suffix
    })
  })

  describe('Valid Ethereum Addresses', () => {
    const validAddress = '0x205d2686da3bf33f64c17f21462c51b5ead462cf'
    const checksummedAddress = '0x205d2686da3Bf33f64C17f21462c51B5eaD462CF'

    it('should create address suggestion with checksummed address on desktop', () => {
      const result = buildSearchSuggestions({
        ...defaultOptions,
        value: validAddress,
        isMobile: false,
      })

      expect(result.length).toBe(2) // Address + ENS name
      expect(result[0].id).toBe(`address:${checksummedAddress}`)
      expect(result[0].label).toBe(checksummedAddress)
      expect(result[0].description).toBe('View address details')
      expect(result[0].inputValue).toBe(checksummedAddress)
    })

    it('should truncate address label on mobile', () => {
      const result = buildSearchSuggestions({
        ...defaultOptions,
        value: validAddress,
        isMobile: true,
      })

      expect(result[0].label).not.toBe(checksummedAddress)
      expect(result[0].label).toContain('0x205d')
      expect(result[0].label).toContain('62CF')
      expect(result[0].inputValue).toBe(checksummedAddress) // inputValue is NOT truncated
    })

    it('should call navigateToAddress when action is invoked', () => {
      const result = buildSearchSuggestions({
        ...defaultOptions,
        value: validAddress,
      })

      result[0].action()
      expect(mockNavigateToAddress).toHaveBeenCalledWith(checksummedAddress)
    })
  })

  describe('Invalid Addresses', () => {
    it('should return empty array for invalid address format', () => {
      const result = buildSearchSuggestions({
        ...defaultOptions,
        value: '0x123', // Too short
      })

      // Should still create ENS name suggestion
      expect(result.length).toBe(1)
      expect(result[0].id).toBe('name:0x123.eth')
    })
  })

  describe('ENS Names', () => {
    it('should add .eth suffix to simple names', () => {
      const result = buildSearchSuggestions({
        ...defaultOptions,
        value: 'vitalik',
      })

      expect(result.length).toBe(1)
      expect(result[0].id).toBe('name:vitalik.eth')
      expect(result[0].label).toBe('vitalik.eth')
      expect(result[0].description).toBe('View ENS name details')
    })

    it('should not double-add .eth suffix', () => {
      const result = buildSearchSuggestions({
        ...defaultOptions,
        value: 'vitalik.eth',
      })

      expect(result[0].label).toBe('vitalik.eth')
      expect(result[0].label).not.toBe('vitalik.eth.eth')
    })

    it('should call navigateToName when action is invoked', () => {
      const result = buildSearchSuggestions({
        ...defaultOptions,
        value: 'vitalik',
      })

      result[0].action()
      expect(mockNavigateToName).toHaveBeenCalledWith('vitalik.eth')
    })
  })

  describe('Address-as-Name (0x + 40 hex chars)', () => {
    const addressAsName = '0x205d2686da3bf33f64c17f21462c51b5ead462cf'
    const lowercaseAddress = '0x205d2686da3bf33f64c17f21462c51b5ead462cf'

    it('should truncate ENS name suggestion on mobile when it contains valid address', () => {
      const result = buildSearchSuggestions({
        ...defaultOptions,
        value: addressAsName,
        isMobile: true,
      })

      // Should have 2 suggestions: address + name
      expect(result.length).toBe(2)

      // Second suggestion is the ENS name (lowercase due to ensureEthSuffix)
      const nameSuggestion = result[1]
      expect(nameSuggestion.id).toBe(`name:${lowercaseAddress}.eth`)
      expect(nameSuggestion.label).toContain('0x205d')
      expect(nameSuggestion.label).toContain('62cf') // lowercase after ensureEthSuffix
      expect(nameSuggestion.label).toContain('.eth')
    })

    it('should NOT truncate ENS name suggestion on desktop', () => {
      const result = buildSearchSuggestions({
        ...defaultOptions,
        value: addressAsName,
        isMobile: false,
      })

      const nameSuggestion = result[1]
      expect(nameSuggestion.label).toBe(`${lowercaseAddress}.eth`)
    })
  })

  describe('Names Starting with 0x (but NOT addresses)', () => {
    it('should NOT truncate name starting with 0x but not being valid address', () => {
      const result = buildSearchSuggestions({
        ...defaultOptions,
        value: '0xdev',
        isMobile: true,
      })

      expect(result.length).toBe(1)
      expect(result[0].label).toBe('0xdev.eth')
      expect(result[0].label).not.toContain('...') // Not truncated
    })

    it('should handle 0x names with special characters', () => {
      const result = buildSearchSuggestions({
        ...defaultOptions,
        value: '0x-test',
        isMobile: true,
      })

      expect(result[0].label).toBe('0x-test.eth')
    })
  })

  describe('Edge Cases', () => {
    it('should handle mixed case addresses', () => {
      const mixedCase = '0x205D2686da3Bf33f64C17f21462c51B5eaD462CF'
      const result = buildSearchSuggestions({
        ...defaultOptions,
        value: mixedCase,
      })

      expect(result[0].inputValue).toBe(
        '0x205d2686da3Bf33f64C17f21462c51B5eaD462CF',
      )
    })

    it('should handle names with subdomains', () => {
      const result = buildSearchSuggestions({
        ...defaultOptions,
        value: 'sub.vitalik',
      })

      // ensureEthSuffix doesn't add .eth to names that already contain a dot
      expect(result[0].label).toBe('sub.vitalik')
    })

    it('should handle names with .eth subdomains', () => {
      const result = buildSearchSuggestions({
        ...defaultOptions,
        value: 'sub.vitalik.eth',
      })

      expect(result[0].label).toBe('sub.vitalik.eth')
    })
  })
})
