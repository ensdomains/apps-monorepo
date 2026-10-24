import { t } from '@lingui/core/macro'
import type { ProfileRecords } from '@/features/profile/types'
import { transformToServiceFormat } from '@/features/profile/utils/transformRecords'
import { parseAbiRecord } from '@/features/profile/utils/validateAbi'

export const getOtherRecordIssues = (records: ProfileRecords): string[] => {
  const texts = transformToServiceFormat(records).texts
  const abi = parseAbiRecord(records.abi)
  return [
    ...(records.unknown.some((record) => !record.key.trim())
      ? [t`Enter a key for each custom record or remove the empty row.`]
      : []),
    ...(new Set(texts.map((record) => record.key)).size === texts.length
      ? []
      : [
          t`Each text record needs a unique key. Remove the duplicate custom record to edit it in its existing field.`,
        ]),
    ...(abi.success ? [] : [abi.message]),
  ]
}
