import { TaggedError } from '@ens-apps/utils/neverthrow'
import { err, ok } from 'neverthrow'
import { normalize } from 'viem/ens'
import { isRenewableV2EthName } from '@/features/grace/utils/gracePeriod'
import { parseName } from '@/features/register-v2/utils/name-parser'

type RenewableNameErrorReason =
  | 'TLD_NOT_SUPPORTED'
  | 'SUBNAMES_NOT_SUPPORTED'
  | 'LABEL_NOT_NORMALIZED'

export class RenewableNameError<
  TReason extends RenewableNameErrorReason,
> extends TaggedError('RenewableNameError')<{
  reason: TReason
}> {
  override get message() {
    return {
      TLD_NOT_SUPPORTED: 'Only .eth names are supported',
      SUBNAMES_NOT_SUPPORTED: 'Subnames are not supported',
      LABEL_NOT_NORMALIZED:
        'This name is not in its normalized form, so it cannot be renewed here',
    }[this.reason]
  }

  static err<const T extends RenewableNameErrorReason>(reason: T) {
    return err(new RenewableNameError({ reason }))
  }
}

export const parseRenewableName = (name: string) =>
  parseName(name).andThen((parsedName) => {
    if (parsedName.tld !== 'eth') {
      return RenewableNameError.err('TLD_NOT_SUPPORTED')
    }

    if (parsedName.subLabels.length > 0) {
      return RenewableNameError.err('SUBNAMES_NOT_SUPPORTED')
    }

    return ok(parsedName)
  })

export const isRenewableName = (name: string) => parseRenewableName(name).isOk()

/** `normalize` throws on unnormalizable names; those are never renewable. */
const safeNormalize = (name: string): string | null => {
  try {
    return normalize(name)
  } catch {
    return null
  }
}

/**
 * The one label both the UI and the `renew` calldata use. `ALICE.eth` and its
 * soft-hyphen look-alike normalize to `alice.eth`, a different registration
 * someone else can own, so a name that isn't already normalized is refused.
 */
export const resolveRenewalLabel = (name: string) =>
  parseRenewableName(name).andThen(({ label }) =>
    safeNormalize(name) === name
      ? ok(label)
      : RenewableNameError.err('LABEL_NOT_NORMALIZED'),
  )

/** The canonical `.eth` name a renewable name resolves to, or `null` if none. */
export const toCanonicalRenewableName = (name: string): string | null =>
  parseRenewableName(name)
    .map(({ label }) => safeNormalize(`${label}.eth`))
    .unwrapOr(null)

export const canRenewV2Name = (
  name: string,
  expiryDate: Date | null | undefined,
) =>
  resolveRenewalLabel(name)
    .map((label) => isRenewableV2EthName(`${label}.eth`, expiryDate))
    .unwrapOr(false)
