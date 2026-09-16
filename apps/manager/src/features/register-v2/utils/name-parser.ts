import { fromSync, TaggedError } from '@ens-apps/utils/neverthrow'
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

type CanonicalName = ParsedName & {
  /**
   * `true` when normalisation changed the name beyond case, so the input is a
   * different name that merely looks like the parsed one. Case folding alone
   * does not count.
   */
  readonly wasRewritten: boolean
}

/**
 * Parses a name into its canonical ENSIP-15 spelling, refusing only what has
 * no canonical form. Callers acting on a name the user already owns want
 * {@link parseName} instead.
 */
export const parseCanonicalName = (
  name: string,
): Result<CanonicalName, ParseNameError<ParseNameReason>> => {
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

  return fromSync(
    () => normalize(joined),
    () => new ParseNameError({ reason: 'NOT_NORMALIZED' as const }),
  ).andThen((normalized) => {
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
      wasRewritten:
        normalized !== joined && normalized !== joined.toLowerCase(),
    })
  })
}

/**
 * Parses a name and refuses anything ENSIP-15 rewrites.
 *
 * `normalize` maps rather than rejects: it deletes a zero-width space and
 * folds confusables like `ⓝ` onto `n`. A name it rewrites renders as one
 * label and hashes as another, so refuse it rather than sign the rewrite.
 *
 * Use this where the name identifies something the user already holds (renew,
 * transfer). Registration owns nothing yet, so it takes
 * {@link parseCanonicalName} and redirects to the canonical spelling.
 */
export const parseName = (
  name: string,
): Result<ParsedName, ParseNameError<ParseNameReason>> =>
  parseCanonicalName(name).andThen(({ wasRewritten, ...parsed }) =>
    wasRewritten ? ParseNameError.err('NOT_NORMALIZED') : ok(parsed),
  )

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
