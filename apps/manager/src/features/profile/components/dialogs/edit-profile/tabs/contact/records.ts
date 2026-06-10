import type { ProfileRecords, TextRecordValue } from '@/features/profile/types'
import { validateEmail } from '@/features/profile/utils/validateUrl'
import {
  type ContactMethod,
  type ContactMethodKey,
  contactMethodKeys,
  contactMethods,
  maxPrimaryContactMethods,
  primaryContactRecordKey,
  primaryContactsRecordKey,
} from './constants'

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

export const getIsPrimaryContactToggleDisabled = ({
  isPrimary,
  primaryContactCount,
}: {
  readonly isPrimary: boolean
  readonly primaryContactCount: number
}): boolean => !isPrimary && primaryContactCount >= maxPrimaryContactMethods

export const getPrimaryContactErrorMessage = ({
  isPrimary,
  label,
  value,
}: {
  readonly isPrimary: boolean
  readonly label: string
  readonly value: string
}): string | undefined =>
  isPrimary && value.trim() === ''
    ? `Add ${label} before pinning it as a primary contact method.`
    : undefined

export const getContactMethodErrorMessage = ({
  isPrimary,
  method,
  value,
}: {
  readonly isPrimary: boolean
  readonly method: ContactMethod
  readonly value: string
}): string | undefined =>
  getPrimaryContactErrorMessage({
    isPrimary,
    label: method.label,
    value,
  }) ?? (method.key === 'email' ? validateEmail(value) : undefined)

export interface ContactValidationIssue {
  readonly key: ContactMethodKey
  readonly message: string
}

export const getPrimaryContactValidationIssues = (
  values: ProfileRecords,
): ContactValidationIssue[] =>
  parsePrimaryContactKeys(values.base).flatMap((key) => {
    const method = contactMethods.find(
      (contactMethod) => contactMethod.key === key,
    )

    if (!method) {
      return []
    }

    const message = getPrimaryContactErrorMessage({
      isPrimary: true,
      label: method.label,
      value: getRecordValue(values, method),
    })

    return message ? [{ key, message }] : []
  })

export const getContactValidationIssues = (
  values: ProfileRecords,
): ContactValidationIssue[] => {
  const primaryContactKeys = parsePrimaryContactKeys(values.base)

  return contactMethods.flatMap((method) => {
    if (
      !hasRecord(values, method) &&
      !primaryContactKeys.includes(method.key)
    ) {
      return []
    }

    const message = getContactMethodErrorMessage({
      isPrimary: primaryContactKeys.includes(method.key),
      method,
      value: getRecordValue(values, method),
    })

    return message ? [{ key: method.key, message }] : []
  })
}

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
