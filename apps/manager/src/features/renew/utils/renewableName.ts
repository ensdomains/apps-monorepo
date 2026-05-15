import { TaggedError } from '@ens-apps/utils/neverthrow'
import { err, ok } from 'neverthrow'
import { parseName } from '@/features/register-v2/utils/name-parser'

type RenewableNameErrorReason = 'TLD_NOT_SUPPORTED' | 'SUBNAMES_NOT_SUPPORTED'

export class RenewableNameError<
  TReason extends RenewableNameErrorReason,
> extends TaggedError('RenewableNameError')<{
  reason: TReason
}> {
  override get message() {
    return {
      TLD_NOT_SUPPORTED: 'Only .eth names are supported',
      SUBNAMES_NOT_SUPPORTED: 'Subnames are not supported',
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
