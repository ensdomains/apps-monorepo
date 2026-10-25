import type { MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import { staticTextRecords, textRecords } from '@/features/profile/data/records'
import type { LinkItem } from '@/features/profile/types'
import { getUrlInputCheckValue } from '@/features/profile/utils/urlInputPrefix'
import {
  URL_INPUT_ISSUE_MESSAGES,
  validateUrlInput,
} from '@/features/profile/utils/urlInputValidation'

export type LinkValidationField = 'name' | 'url'

export interface LinkValidationIssue {
  readonly field: LinkValidationField
  readonly index: number
  readonly message: MessageDescriptor
}

const reservedTextRecordKeys = new Set<string>([
  ...staticTextRecords,
  ...textRecords.map((record) => record.key),
])

export const isReservedTextRecordKey = (name: string) =>
  reservedTextRecordKeys.has(name.trim())

const isEmptyLink = (link: LinkItem) =>
  link.name.trim() === '' && getUrlInputCheckValue(link.url).trim() === ''

const getLinkNameMessage = (name: string): MessageDescriptor | undefined => {
  if (name.trim() === '') return msg`Enter a title`
  if (isReservedTextRecordKey(name)) {
    return msg`Choose a different name (reserved key)`
  }
  return undefined
}

const getLinkUrlMessage = (url: string): MessageDescriptor | undefined => {
  if (getUrlInputCheckValue(url).trim() === '') return msg`Enter a link`

  const result = validateUrlInput(url)
  return result.isErr()
    ? URL_INPUT_ISSUE_MESSAGES[result.error.reason]
    : undefined
}

export const getLinkValidationIssues = (
  links: readonly LinkItem[],
): LinkValidationIssue[] =>
  links.flatMap((link, index) => {
    if (isEmptyLink(link)) {
      return []
    }

    const fieldMessages = [
      ['name', getLinkNameMessage(link.name)],
      ['url', getLinkUrlMessage(link.url)],
    ] as const

    return fieldMessages.flatMap(([field, message]) =>
      message ? [{ field, index, message }] : [],
    )
  })
