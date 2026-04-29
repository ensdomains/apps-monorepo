import { TaggedError } from '@ens-apps/utils/neverthrow'
import { err, ok } from 'neverthrow'

// ENS names rules:
// - Minimum 3 characters for the label (excluding .eth)
// - Allowed: letters, numbers, hyphens, emojis
// - Not allowed: spaces, special characters like &, *, etc.
// - No multiple consecutive dots
// - Any tld is allowed, if not present, it is assumed to be .eth

class ParseNameError<TReason extends string> extends TaggedError(
  'ParseNameError',
)<{
  reason: TReason
}> {
  override get message() {
    return `Invalid ENS name: ${this.reason}`
  }

  static err<const T extends string>(reason: T) {
    return err(new ParseNameError({ reason }))
  }
}

export const parseName = (name: string) => {
  // Remove any leading or trailing whitespace
  const normalized = name.trim().toLowerCase()

  // Spaces are not allowed
  if (normalized.includes(' ')) {
    return ParseNameError.err('SPACE_NOT_ALLOWED')
  }

  // Multiple consecutive dots are not allowed
  if (normalized.includes('..')) {
    return ParseNameError.err('MULTIPLE_CONSECUTIVE_DOTS')
  }

  const labels = normalized.split('.').filter(Boolean)
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
  })
}

export const isRootEthName = (name: string) => {
  const parsedName = parseName(name)

  if (parsedName.isErr()) {
    return false
  }

  return (
    parsedName.value.tld === 'eth' && parsedName.value.subLabels.length === 0
  )
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
