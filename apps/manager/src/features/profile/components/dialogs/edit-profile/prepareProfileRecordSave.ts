import { createResolverImportDraft } from '@/features/profile/service/resolverImportDraft'
import {
  getResolverRecordWrites,
  getResolverReplacementRecords,
} from '@/features/profile/service/resolverReplacementRecords'
import type { ProfileRecords } from '@/features/profile/types'
import { createDiff } from '@/features/profile/utils/createDiff'
import {
  normalizeProfileRecords,
  transformToServiceFormat,
} from '@/features/profile/utils/transformRecords'

/** Keep the raw edit keys independent of submission normalization and the confirmation. */
export const prepareProfileRecordSave = (
  savedRecords: ProfileRecords,
  values: ProfileRecords,
  needsReplacement: boolean,
) => {
  const submittedValues = normalizeProfileRecords(values)
  const hasChanges =
    Object.keys(createDiff(savedRecords, submittedValues)).length > 0
  if (!needsReplacement)
    return {
      previewValues: submittedValues,
      validationValues: values,
      editedRecordKeys: [] as string[],
      hasChanges,
      hasReplacementWrites: false,
      savedAbi: savedRecords.abi,
    }

  const before = transformToServiceFormat(savedRecords)
  const editedRecordKeys = getResolverRecordWrites(
    getResolverReplacementRecords(before, transformToServiceFormat(values)),
  ).map(({ key }) => key)
  const replacementRecords = getResolverReplacementRecords(
    before,
    transformToServiceFormat(submittedValues),
  )
  const previewValues = createResolverImportDraft({
    ...replacementRecords,
    resolverAddress: savedRecords.resolverAddress,
  })
  return {
    previewValues,
    validationValues: previewValues,
    editedRecordKeys,
    hasChanges,
    hasReplacementWrites:
      getResolverRecordWrites(replacementRecords).length > 0,
    savedAbi: undefined,
  }
}
