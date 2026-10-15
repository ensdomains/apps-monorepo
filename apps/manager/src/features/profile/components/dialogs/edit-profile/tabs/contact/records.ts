import type { ProfileRecords, TextRecordValue } from '@/features/profile/types'
import {
  isWithinPrimaryContactsRecordSize,
  MAX_PRIMARY_CONTACTS_RECORD_ITEMS,
} from '@/features/profile/utils/primaryContactLimits'
import { validateEmail } from '@/features/profile/utils/validateUrl'
import {
  type ContactMethod,
  type ContactMethodKey,
  contactMethodKeys,
  contactMethods,
  maxPrimaryContactMethods,
  primaryContactRecordKey,
  primaryContactsRecordKey,
  socialContactMethodKeys,
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

const getPrimaryContactErrorMessage = ({
  isPrimary,
  label,
  value,
}: {
  readonly isPrimary: boolean
  readonly label: string
  readonly value: string
}): string | undefined =>
  isPrimary && value.trim() === ''
    ? `Add ${label} before featuring it on your profile.`
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

interface ContactValidationIssue {
  readonly key: ContactMethodKey
  readonly message: string
}

export const contactErrorMessageIconSymbol = 'warning'
export const contactErrorMessageClassName =
  'flex items-start gap-1 text-xs text-ens-signal-danger-600 leading-[1.2]'
export const contactErrorMessageIconClassName =
  'ms-opsz-12 ms-wght-400 mt-px shrink-0'

const publicContactNoticeMethodKeys: ReadonlySet<ContactMethodKey> = new Set([
  'email',
  'mail',
  'phone',
])

const publicContactNoticeMessage =
  'Your contact information is publicly viewable on your profile.'

export const getContactMethodNoticeMessage = (
  method: ContactMethod,
): string | undefined =>
  publicContactNoticeMethodKeys.has(method.key)
    ? publicContactNoticeMessage
    : undefined

export const getContactValidationIssues = (
  values: ProfileRecords,
): ContactValidationIssue[] => {
  const primaryContactKeys = getPrimarySocialContactKeys(values.base)

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

const isContactMethodKey = (key: unknown): key is ContactMethodKey =>
  typeof key === 'string' && contactMethodKeys.has(key as ContactMethodKey)

const normalizePrimaryContactKeys = (
  keys: readonly unknown[],
): ContactMethodKey[] => {
  const uniqueKeys = new Set<ContactMethodKey>()
  const limit = Math.min(keys.length, MAX_PRIMARY_CONTACTS_RECORD_ITEMS)

  // A bounded loop preserves order and stops as soon as all slots are filled.
  for (let index = 0; index < limit; index++) {
    const key = keys[index]
    if (!isContactMethodKey(key)) continue

    uniqueKeys.add(key)
    if (uniqueKeys.size === maxPrimaryContactMethods) break
  }

  return [...uniqueKeys]
}

export const parsePrimaryContactKeys = (
  base: ProfileRecords['base'],
): ContactMethodKey[] => {
  const rawPrimaryContacts = base[primaryContactsRecordKey]
  const serializedPrimaryContacts =
    rawPrimaryContacts && isWithinPrimaryContactsRecordSize(rawPrimaryContacts)
      ? rawPrimaryContacts.trim()
      : undefined

  if (serializedPrimaryContacts?.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(serializedPrimaryContacts)

      if (Array.isArray(parsed)) {
        return normalizePrimaryContactKeys(parsed)
      }
    } catch {
      // Fall through to the ENSIP-18 single-record fallback.
    }
  }

  const primaryContact = base[primaryContactRecordKey]?.trim()
  return primaryContact ? normalizePrimaryContactKeys([primaryContact]) : []
}

export const getPrimarySocialContactKeys = (
  base: ProfileRecords['base'],
): ContactMethodKey[] =>
  parsePrimaryContactKeys(base).filter((key) =>
    socialContactMethodKeys.has(key),
  )

export const getBaseWithPrimarySocialContactKeys = (
  base: ProfileRecords['base'],
  socialKeys: readonly ContactMethodKey[],
): ProfileRecords['base'] =>
  getBaseWithPrimaryContactKeys(base, [
    ...parsePrimaryContactKeys(base).filter(
      (key) => !socialContactMethodKeys.has(key),
    ),
    ...socialKeys,
  ])

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
