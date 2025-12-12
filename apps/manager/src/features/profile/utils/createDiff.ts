import { allSections, getAddressRecordDef, getRecordDef } from '../data/records'
import type { ProfileRecords } from '../types'

type DiffValue = string | undefined

type DiffEntry = {
  original?: DiffValue
  current?: DiffValue
  type: 'added' | 'removed' | 'modified'
  sectionLabel?: string
  fieldLabel?: string
  sectionKey?: string
  fieldKey?: string
}

type Diff = Record<string, DiffEntry>

const toNormalizedString = (value: unknown): string =>
  String(value ?? '').trim()

const getSectionDisplayName = (section: string): string => {
  const displayNames: Record<string, string> = {
    address: 'Address',
    bio: 'Bio',
    social: 'Social',
    contact: 'Contact',
    links: 'Links',
  }

  return (
    displayNames[section] ?? section.charAt(0).toUpperCase() + section.slice(1)
  )
}

// Pure utility functions
const isEmptyValue = (value: unknown): boolean => {
  const str = toNormalizedString(value)
  return str === '' || str === 'undefined' || str === 'null'
}

const hasValueChanged = (oldVal: unknown, newVal: unknown): boolean =>
  toNormalizedString(oldVal) !== toNormalizedString(newVal)

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
  originalValue: unknown,
  currentValue: unknown,
): DiffEntry | null => {
  const originalEmpty = isEmptyValue(originalValue)
  const currentEmpty = isEmptyValue(currentValue)

  if (currentEmpty && !originalEmpty) {
    return {
      original: toNormalizedString(originalValue),
      type: 'removed',
    }
  }

  if (!currentEmpty && originalEmpty) {
    return {
      current: toNormalizedString(currentValue),
      type: 'added',
    }
  }

  if (
    !currentEmpty &&
    !originalEmpty &&
    hasValueChanged(originalValue, currentValue)
  ) {
    return {
      original: toNormalizedString(originalValue),
      current: toNormalizedString(currentValue),
      type: 'modified',
    }
  }

  return null
}

// Pure function to compare maps and generate diffs into a target object
const addKeyValueDiffs = (
  target: Diff,
  originalMap: Map<string, unknown>,
  currentMap: Map<string, unknown>,
  section: string,
  getDisplayName: (key: string) => string = (key) => key,
): void => {
  const allKeys = new Set([...originalMap.keys(), ...currentMap.keys()])

  for (const key of allKeys) {
    const originalValue = originalMap.get(key)
    const currentValue = currentMap.get(key)
    const diffEntry = createDiffEntry(originalValue, currentValue)

    if (diffEntry) {
      const displayName = getDisplayName(key)
      const sectionLabel = getSectionDisplayName(section)
      diffEntry.sectionLabel = sectionLabel
      diffEntry.fieldLabel = displayName
      diffEntry.sectionKey = section
      diffEntry.fieldKey = String(key)
      target[`${sectionLabel}: ${displayName}`] = diffEntry
    }
  }
}

// Pure function to convert records to map
const recordsToMap = <T extends { key: string; value: unknown }>(
  records: T[],
): Map<string, unknown> => new Map(records.map((r) => [r.key, r.value]))

const addressesToMap = (
  addresses: Array<{ coinType: number; value: string }>,
): Map<string, unknown> =>
  new Map(addresses.map((a) => [String(a.coinType), a.value]))

const baseToMap = (base: Record<string, unknown>): Map<string, unknown> =>
  new Map(Object.entries(base).filter(([, value]) => !isEmptyValue(value)))

// Pure function to create links diff
const createLinksDiff = (
  originalLinks: unknown[] | undefined,
  currentLinks: unknown[] | undefined,
): DiffEntry | null => {
  const original = originalLinks || []
  const current = currentLinks || []

  if (JSON.stringify(original) === JSON.stringify(current)) {
    return null
  }

  const formatLinkCount = (links: unknown[]) =>
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

  const diff: Diff = {}

  // Process addresses
  addKeyValueDiffs(
    diff,
    addressesToMap(original.addresses),
    addressesToMap(current.addresses),
    'address',
    (coinType) => getAddressDisplayName(Number(coinType)),
  )

  // Process bio fields
  addKeyValueDiffs(
    diff,
    baseToMap(original.base || {}),
    baseToMap(current.base || {}),
    'bio',
    getBioDisplayName,
  )

  // Process all sections
  for (const section of allSections) {
    addKeyValueDiffs(
      diff,
      recordsToMap(original[section]),
      recordsToMap(current[section]),
      section,
      (key) => getRecordDef(key)?.name || key,
    )
  }

  // Process links
  const linksDiffEntry = createLinksDiff(original.links, current.links)
  if (linksDiffEntry) {
    const sectionLabel = getSectionDisplayName('links')
    diff[sectionLabel] = {
      ...linksDiffEntry,
      sectionLabel,
      fieldLabel: 'Links',
      sectionKey: 'links',
      fieldKey: 'links',
    }
  }

  return diff
}
