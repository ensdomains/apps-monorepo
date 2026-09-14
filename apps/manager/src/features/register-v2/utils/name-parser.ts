import { TaggedError } from '@ens-apps/utils/neverthrow'
import { err, ok, type Result } from 'neverthrow'
import { normalize } from 'viem/ens'

// ENS names rules:
// - Minimum 3 characters for the label (excluding .eth)
// - Allowed: letters, numbers, hyphens, emojis
// - Not allowed: spaces, special characters like &, *, etc.
// - No multiple consecutive dots
// - Any tld is allowed, if not present, it is assumed to be .eth
// - Labels must already be in ENSIP-15 normalised form, up to case

const INVALID_LABEL_CHARS = /[&*@#$%^()[\]{}|\\:;"'<>?,=+~`!]/

type ParseNameReason =
  | 'SPACE_NOT_ALLOWED'
  | 'MULTIPLE_CONSECUTIVE_DOTS'
  | 'LABEL_NOT_FOUND'
  | 'INVALID_CHARACTER'
  | 'NOT_NORMALIZED'

const PARSE_NAME_MESSAGES: Record<ParseNameReason, string> = {
  SPACE_NOT_ALLOWED: 'ENS names cannot contain spaces.',
  MULTIPLE_CONSECUTIVE_DOTS: 'ENS names cannot contain consecutive dots.',
  LABEL_NOT_FOUND: 'This name is missing a label.',
  INVALID_CHARACTER: 'This name contains a character ENS does not allow.',
  NOT_NORMALIZED:
    'This name contains characters that are not displayed as written, so it cannot be used. Check the link and type the name yourself.',
}

export class ParseNameError<
  TReason extends ParseNameReason,
> extends TaggedError('ParseNameError')<{
  reason: TReason
}> {
  override get message() {
    return PARSE_NAME_MESSAGES[this.reason]
  }

  static err<const T extends ParseNameReason>(reason: T) {
    return err(new ParseNameError({ reason }))
  }
}

type ParsedName = {
  readonly subLabels: readonly string[]
  readonly label: string
  readonly tld: string
  readonly name: string
}

export const parseName = (
  name: string,
): Result<ParsedName, ParseNameError<ParseNameReason>> => {
  // Remove any leading or trailing whitespace
  const trimmed = name.trim()

  // Whitespace is not allowed inside names
  if (/\s/.test(trimmed)) {
    return ParseNameError.err('SPACE_NOT_ALLOWED')
  }

  // Multiple consecutive dots are not allowed
  if (trimmed.includes('..')) {
    return ParseNameError.err('MULTIPLE_CONSECUTIVE_DOTS')
  }

  const rawLabels = trimmed.split('.').filter(Boolean)

  if (rawLabels.some((part) => INVALID_LABEL_CHARS.test(part))) {
    return ParseNameError.err('INVALID_CHARACTER')
  }

  const joined = rawLabels.join('.')

  let normalized: string
  try {
    normalized = normalize(joined)
  } catch {
    return ParseNameError.err('NOT_NORMALIZED')
  }

  // `normalize` maps rather than rejects: it deletes a zero-width space or a
  // stray variation selector and folds confusables like `ⓝ` onto `n`. A name it
  // rewrites is one that renders as one label and hashes as another, so refuse
  // it instead of silently signing the rewrite.
  if (normalized !== joined && normalized !== joined.toLowerCase()) {
    return ParseNameError.err('NOT_NORMALIZED')
  }

  const labels = normalized.split('.')
  const tld = labels.length > 1 ? labels.pop() : 'eth'
  const label = labels.pop()

  if (!label || !tld) {
    return ParseNameError.err('LABEL_NOT_FOUND')
  }

  return ok({
    subLabels: labels,
    label,
    tld,
    name: [...labels, label, tld].join('.'),
  })
}

/**
 * Correctly calculates the length of a ENS label by iterating over the string iterator and counting the number of code points.
 */
export const getLabelLength = (label: string) => {
  let length = 0
  for (const _ of label) {
    length++
  }
  return length
}
