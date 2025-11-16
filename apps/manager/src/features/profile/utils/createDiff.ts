import { allSections, getAddressRecordDef } from '../data/records'
import type { ProfileRecords } from '../types'

type DiffEntry = {
  original?: any
  current?: any
  type: 'added' | 'removed' | 'modified'
}

type Diff = Record<string, DiffEntry>

// Pure utility functions
const isEmptyValue = (value: any): boolean => {
  if (value === undefined || value === null) return true
  const str = String(value).trim()
  return str === '' || str === 'undefined' || str === 'null'
}

const hasValueChanged = (oldVal: any, newVal: any): boolean => {
  const oldStr = String(oldVal || '').trim()
  const newStr = String(newVal || '').trim()
  return oldStr !== newStr
}

const getAddressDisplayName = (coinType: number): string =>
  getAddressRecordDef(coinType)?.name || `Address ${coinType}`

const getBioDisplayName = (key: string): string => {
  const displayNames: Record<string, string> = {
    description: 'Bio Description',
    url: 'Bio URL',
    avatar: 'Avatar',
    header: 'Header Image',
  }
  return displayNames[key] || key
}

// Pure function to create a diff entry
const createDiffEntry = (
  originalValue: any,
  currentValue: any,
): DiffEntry | null => {
  const originalEmpty = isEmptyValue(originalValue)
  const currentEmpty = isEmptyValue(currentValue)

  if (currentEmpty && !originalEmpty) {
    return { original: originalValue, type: 'removed' }
  }

  if (!currentEmpty && originalEmpty) {
    return { current: currentValue, type: 'added' }
  }

  if (
    !currentEmpty &&
    !originalEmpty &&
    hasValueChanged(originalValue, currentValue)
  ) {
    return { original: originalValue, current: currentValue, type: 'modified' }
  }

  return null
}

// Pure function to compare maps and generate diffs
const compareKeyValuePairs = (
  originalMap: Map<string, any>,
  currentMap: Map<string, any>,
  section: string,
  getDisplayName: (key: string) => string = (key) => key,
): Diff => {
  const allKeys = new Set([...originalMap.keys(), ...currentMap.keys()])

  return Array.from(allKeys).reduce((acc, key) => {
    const originalValue = originalMap.get(key)
    const currentValue = currentMap.get(key)
    const diffEntry = createDiffEntry(originalValue, currentValue)

    if (diffEntry) {
      const displayName = getDisplayName(key)
      return { ...acc, [`${section}.${displayName}`]: diffEntry }
    }

    return acc
  }, {} as Diff)
}

// Pure function to convert records to map
const recordsToMap = <T extends { key: string; value: any }>(
  records: T[],
): Map<string, any> => new Map(records.map((r) => [r.key, r.value]))

const addressesToMap = (
  addresses: Array<{ coinType: number; value: string }>,
): Map<string, any> =>
  new Map(addresses.map((a) => [String(a.coinType), a.value]))

const baseToMap = (base: Record<string, any>): Map<string, any> =>
  new Map(Object.entries(base).filter(([, value]) => !isEmptyValue(value)))

// Pure function to create links diff
const createLinksDiff = (
  originalLinks: any[] | undefined,
  currentLinks: any[] | undefined,
): DiffEntry | null => {
  const original = originalLinks || []
  const current = currentLinks || []

  if (JSON.stringify(original) === JSON.stringify(current)) {
    return null
  }

  const formatLinkCount = (links: any[]) =>
    `${links.length} link${links.length !== 1 ? 's' : ''}`

  if (original.length === 0 && current.length > 0) {
    return { current: formatLinkCount(current), type: 'added' }
  }

  if (original.length > 0 && current.length === 0) {
    return { original: formatLinkCount(original), type: 'removed' }
  }

  if (original.length > 0 && current.length > 0) {
    return {
      original: formatLinkCount(original),
      current: formatLinkCount(current),
      type: 'modified',
    }
  }

  return null
}

// Main functional createDiff
export const createDiff = (
  original: ProfileRecords,
  current: ProfileRecords,
): Diff => {
  // Early return for same reference
  if (original === current) return {}

  // Process addresses
  const addressDiff = compareKeyValuePairs(
    addressesToMap(original.addresses),
    addressesToMap(current.addresses),
    'address',
    (coinType) => getAddressDisplayName(Number(coinType)),
  )

  // Process bio fields
  const bioDiff = compareKeyValuePairs(
    baseToMap(original.base || {}),
    baseToMap(current.base || {}),
    'bio',
    getBioDisplayName,
  )

  // Process all sections
  const sectionDiffs = allSections.reduce(
    (acc, section) => ({
      ...acc,
      ...compareKeyValuePairs(
        recordsToMap(original[section]),
        recordsToMap(current[section]),
        section,
      ),
    }),
    {} as Diff,
  )

  // Process links
  const linksDiffEntry = createLinksDiff(original.links, current.links)
  const linksDiff: Diff = linksDiffEntry ? { links: linksDiffEntry } : {}

  // Combine all diffs
  return {
    ...addressDiff,
    ...bioDiff,
    ...sectionDiffs,
    ...linksDiff,
  }
}
