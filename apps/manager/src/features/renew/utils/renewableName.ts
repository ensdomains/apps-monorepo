import { ok } from 'neverthrow'
import {
  ParseNameError,
  parseName,
} from '@/features/register-v2/utils/name-parser'

export const parseRenewableName = (name: string) =>
  parseName(name).andThen((parsedName) => {
    if (parsedName.tld !== 'eth') {
      return ParseNameError.err('TLD_NOT_SUPPORTED')
    }

    if (parsedName.subLabels.length > 0) {
      return ParseNameError.err('SUBNAMES_NOT_SUPPORTED')
    }

    return ok(parsedName)
  })

export const isRenewableName = (name: string) => parseRenewableName(name).isOk()
