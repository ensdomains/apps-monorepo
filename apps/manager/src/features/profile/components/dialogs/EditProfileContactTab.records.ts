import type { ProfileRecords, TextRecordValue } from '../../types'
import {
  type ContactMethod,
  type ContactMethodKey,
  contactMethodKeys,
  maxPrimaryContactMethods,
  primaryContactRecordKey,
  primaryContactsRecordKey,
} from './EditProfileContactTab.constants'

export const getRecordsForMethod = (
  values: ProfileRecords,
  method: ContactMethod,
): TextRecordValue[] => values[method.section]

export const hasRecord = (
  values: ProfileRecords,
  method: ContactMethod,
): boolean =>
  getRecordsForMethod(values, method).some(
    (record) => record.key === method.key,
  )

export const getRecordValue = (
  values: ProfileRecords,
  method: ContactMethod,
): string =>
  getRecordsForMethod(values, method).find(
    (record) => record.key === method.key,
  )?.value ?? ''

export const upsertRecordValue = (
  records: readonly TextRecordValue[],
  key: string,
  value: string,
): TextRecordValue[] =>
  records.some((record) => record.key === key)
    ? records.map((record) =>
        record.key === key ? { ...record, value } : record,
      )
    : [...records, { key, value }]

export const removeRecord = (
  records: readonly TextRecordValue[],
  key: string,
): TextRecordValue[] => records.filter((record) => record.key !== key)

const isContactMethodKey = (key: string): key is ContactMethodKey =>
  contactMethodKeys.has(key as ContactMethodKey)

export const normalizePrimaryContactKeys = (
  keys: readonly string[],
): ContactMethodKey[] => {
  const validKeys = keys.filter(isContactMethodKey)

  return validKeys
    .filter((key, index) => validKeys.indexOf(key) === index)
    .slice(0, maxPrimaryContactMethods)
}

export const parsePrimaryContactKeys = (
  base: ProfileRecords['base'],
): ContactMethodKey[] => {
  const serializedPrimaryContacts = base[primaryContactsRecordKey]?.trim()

  if (serializedPrimaryContacts) {
    try {
      const parsed = JSON.parse(serializedPrimaryContacts)

      if (Array.isArray(parsed)) {
        return normalizePrimaryContactKeys(
          parsed.filter((key): key is string => typeof key === 'string'),
        )
      }
    } catch {
      // Fall through to the ENSIP-18 single-record fallback.
    }
  }

  const primaryContact = base[primaryContactRecordKey]?.trim()
  return primaryContact ? normalizePrimaryContactKeys([primaryContact]) : []
}

export const getBaseWithPrimaryContactKeys = (
  base: ProfileRecords['base'],
  keys: readonly ContactMethodKey[],
): ProfileRecords['base'] => {
  const nextBase = { ...base }

  if (keys.length === 0) {
    delete nextBase[primaryContactRecordKey]
    delete nextBase[primaryContactsRecordKey]
    return nextBase
  }

  nextBase[primaryContactRecordKey] = keys[0]
  nextBase[primaryContactsRecordKey] = JSON.stringify(keys)
  return nextBase
}
