import type { MessageDescriptor } from '@lingui/core'
import * as v from 'valibot'
import { getUrlInputCheckValue } from './urlInputPrefix'
import {
  URL_INPUT_ISSUE_MESSAGES,
  validateUrlInput,
} from './urlInputValidation'

const emailSchema = v.pipe(
  v.string(),
  v.trim(),
  v.email('Enter a valid email address'),
)

export const validateUrl = (
  value: string | undefined,
): MessageDescriptor | undefined => {
  if (!value || getUrlInputCheckValue(value).trim() === '') return undefined

  const result = validateUrlInput(value)
  return result.isErr()
    ? URL_INPUT_ISSUE_MESSAGES[result.error.reason]
    : undefined
}

export const validateEmail = (value: string | undefined) => {
  if (!value || value.trim() === '') return undefined

  const result = v.safeParse(emailSchema, value)

  if (!result.success) {
    return result.issues[0]?.message
  }

  return undefined
}
