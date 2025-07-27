import { getAddressRecord, getRecord } from '../data/records'
import type { ProfileRecords } from '../types'

// Utility function to create diff
export const createDiff = (
  original: ProfileRecords,
  current: ProfileRecords,
) => {
  const diff: Record<
    string,
    { original?: any; current?: any; type: 'added' | 'removed' | 'modified' }
  > = {}

  // Early return if objects are the same reference
  if (original === current) return diff

  // Helper function to compare values (handles undefined, null, empty strings)
  const hasValueChanged = (oldVal: any, newVal: any): boolean => {
    const oldStr = String(oldVal || '').trim()
    const newStr = String(newVal || '').trim()
    return oldStr !== newStr
  }

  // Helper function to get display name for address records
  const getAddressDisplayName = (coinType: number): string => {
    return getAddressRecord(coinType)?.name || `Address ${coinType}`
  }

  // Helper function to check if a value is effectively empty
  const isEmptyValue = (value: any): boolean => {
    if (value === undefined || value === null) return true
    const str = String(value).trim()
    return str === '' || str === 'undefined' || str === 'null'
  }

  // Generic function to compare key-value pairs
  const compareKeyValuePairs = (
    originalMap: Map<string, any>,
    currentMap: Map<string, any>,
    category: string,
    getDisplayName?: (key: string) => string,
  ) => {
    // Process current records (added/modified)
    for (const [key, currentValue] of currentMap) {
      const originalValue = originalMap.get(key)
      const displayName = getDisplayName ? getDisplayName(key) : key

      // Skip if current value is empty (treat as not set)
      if (isEmptyValue(currentValue)) {
        // If there was an original value, this counts as removed
        if (!isEmptyValue(originalValue)) {
          diff[`${category}.${displayName}`] = {
            original: originalValue,
            type: 'removed',
          }
        }
        continue
      }

      if (originalValue === undefined || isEmptyValue(originalValue)) {
        // Added (only if current value is not empty)
        diff[`${category}.${displayName}`] = {
          current: currentValue,
          type: 'added',
        }
      } else if (hasValueChanged(originalValue, currentValue)) {
        // Modified
        diff[`${category}.${displayName}`] = {
          original: originalValue,
          current: currentValue,
          type: 'modified',
        }
      }
    }

    // Process removed records (only for non-empty original values)
    for (const [key, originalValue] of originalMap) {
      if (!currentMap.has(key) && !isEmptyValue(originalValue)) {
        const displayName = getDisplayName ? getDisplayName(key) : key
        diff[`${category}.${displayName}`] = {
          original: originalValue,
          type: 'removed',
        }
      }
    }
  }

  // Compare social records
  const originalSocialMap = new Map(
    original.social.map((s) => [s.key, s.value]),
  )
  const currentSocialMap = new Map(current.social.map((s) => [s.key, s.value]))
  compareKeyValuePairs(originalSocialMap, currentSocialMap, 'social')

  // Compare address records
  const originalAddressMap = new Map(
    original.addresses.map((a) => [String(a.coinType), a.value]),
  )
  const currentAddressMap = new Map(
    current.addresses.map((a) => [String(a.coinType), a.value]),
  )
  compareKeyValuePairs(
    originalAddressMap,
    currentAddressMap,
    'address',
    (coinType) => getAddressDisplayName(Number(coinType)),
  )

  // Compare bio fields
  const originalBioMap = new Map()
  const currentBioMap = new Map()

  // Add bio fields to maps (only non-empty values)
  if (original.base) {
    Object.entries(original.base).forEach(([key, value]) => {
      if (!isEmptyValue(value)) {
        originalBioMap.set(key, value)
      }
    })
  }
  if (current.base) {
    Object.entries(current.base).forEach(([key, value]) => {
      if (!isEmptyValue(value)) {
        currentBioMap.set(key, value)
      }
    })
  }

  const getBioDisplayName = (key: string): string => {
    const displayNames: Record<string, string> = {
      description: 'Bio Description',
      url: 'Bio URL',
      avatar: 'Avatar',
      header: 'Header Image',
    }
    return displayNames[key] || key
  }

  compareKeyValuePairs(originalBioMap, currentBioMap, 'bio', getBioDisplayName)

  // Compare contact records
  const originalContactMap = new Map(
    original.contact.map((c) => [c.key, c.value]),
  )
  const currentContactMap = new Map(
    current.contact.map((c) => [c.key, c.value]),
  )
  compareKeyValuePairs(originalContactMap, currentContactMap, 'contact')

  // Compare links (treat as a single field since it's stored as JSON string)
  const originalLinksStr = JSON.stringify(original.links || [])
  const currentLinksStr = JSON.stringify(current.links || [])

  if (originalLinksStr !== currentLinksStr) {
    // Parse the links for better display
    const originalLinks = original.links || []
    const currentLinks = current.links || []

    // If links were completely removed
    if (originalLinks.length > 0 && currentLinks.length === 0) {
      diff['links'] = {
        original: `${originalLinks.length} link${originalLinks.length > 1 ? 's' : ''}`,
        type: 'removed',
      }
    }
    // If links were added
    else if (originalLinks.length === 0 && currentLinks.length > 0) {
      diff['links'] = {
        current: `${currentLinks.length} link${currentLinks.length > 1 ? 's' : ''}`,
        type: 'added',
      }
    }
    // If links were modified
    else if (originalLinks.length > 0 && currentLinks.length > 0) {
      diff['links'] = {
        original: `${originalLinks.length} link${originalLinks.length > 1 ? 's' : ''}`,
        current: `${currentLinks.length} link${currentLinks.length > 1 ? 's' : ''}`,
        type: 'modified',
      }
    }
  }

  return diff
}
