import { TaggedError } from '@ens-apps/utils/neverthrow'
import { err, ok, type Result } from 'neverthrow'
import { normalize } from 'viem/ens'

// ENS names rules:
// - Minimum 3 characters for the label (excluding .eth)
// - Allowed: letters, numbers, hyphens, emojis
// - Not allowed: spaces, special characters like &, *, etc.
// - No multiple consecutive dots
// - Any tld is allowed, if not present, it is assumed to be .eth
// - Labels must already be in ENSIP-15 normalised form (up to case)

const INVALID_LABEL_CHARS = /[&*@#$%^()[\]{}|\\:;"'<>?,=+~`!]/

const PARSE_NAME_MESSAGES: Record<string, string> = {
  SPACE_NOT_ALLOWED: 'ENS names cannot contain spaces.',
  MULTIPLE_CONSECUTIVE_DOTS: 'ENS names cannot contain consecutive dots.',
  TLD_NOT_FOUND: 'This name is missing a TLD.',
  LABEL_NOT_FOUND: 'This name is missing a label.',
  INVALID_CHARACTER: 'This name contains a character ENS does not allow.',
  NOT_NORMALIZED:
    'This name contains characters that are not displayed as written, so it cannot be used. Check the link and type the name yourself.',
}

export class ParseNameError<TReason extends string> extends TaggedError(
  'ParseNameError',
)<{
  reason: TReason
}> {
  override get message() {
    return (
      PARSE_NAME_MESSAGES[this.reason] ?? `Invalid ENS name: ${this.reason}`
    )
  }

  static err<const T extends string>(reason: T) {
    return err(new ParseNameError({ reason }))
  }
}

type ParsedName = {
  subLabels: string[]
  label: string
  tld: string
  /** The normalised name the labels above were taken from. */
  name: string
}

/**
 * ENSIP-15 normalises the labels and refuses anything that isn't already in
 * normalised form apart from case.
 *
 * `normalize` maps rather than rejects: it silently deletes a zero-width space
 * or a stray variation selector, and folds confusables like `ⓝ` onto `n`. A
 * name whose normalised form differs from what the user typed is therefore a
 * name that renders as one label and hashes as another, so it is refused here
 * rather than quietly rewritten — the registrar hashes the label bytes it is
 * handed, and nothing downstream re-checks them.
 */
const normalizeLabels = (
  labels: string[],
): Result<string[], ParseNameError<'NOT_NORMALIZED'>> => {
  const joined = labels.join('.')

  let normalized: string
  try {
    normalized = normalize(joined)
  } catch {
    return ParseNameError.err('NOT_NORMALIZED')
  }

  if (normalized !== joined && normalized !== joined.toLowerCase()) {
    return ParseNameError.err('NOT_NORMALIZED')
  }

  const normalizedLabels = normalized.split('.')

  if (
    normalizedLabels.length !== labels.length ||
    normalizedLabels.some((label) => !label)
  ) {
    return ParseNameError.err('NOT_NORMALIZED')
  }

  return ok(normalizedLabels)
}

export const parseName = (
  name: string,
): Result<
  ParsedName,
  ParseNameError<
    | 'SPACE_NOT_ALLOWED'
    | 'MULTIPLE_CONSECUTIVE_DOTS'
    | 'TLD_NOT_FOUND'
    | 'LABEL_NOT_FOUND'
    | 'INVALID_CHARACTER'
    | 'NOT_NORMALIZED'
  >
> => {
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

  if (rawLabels.length === 0) {
    return ParseNameError.err('LABEL_NOT_FOUND')
  }

  if (rawLabels.some((part) => INVALID_LABEL_CHARS.test(part))) {
    return ParseNameError.err('INVALID_CHARACTER')
  }

  const normalizedLabels = normalizeLabels(rawLabels)

  if (normalizedLabels.isErr()) {
    return err(normalizedLabels.error)
  }

  const labels = normalizedLabels.value
  const hasTld = labels.length > 1

  const tld = hasTld ? labels.pop() : 'eth'

  if (!tld) {
    return ParseNameError.err('TLD_NOT_FOUND')
  }

  const label = labels.pop()

  if (!label) {
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
