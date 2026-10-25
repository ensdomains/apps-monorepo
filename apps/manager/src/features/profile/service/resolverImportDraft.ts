import type { ProfileRecords } from '../types'
import {
  transformProfileRecords,
  transformToServiceFormat,
} from '../utils/transformRecords'
import type { ProfileRecordsResult } from './profileRecords'

/** Preserve raw values whenever a dedicated field cannot represent them losslessly. */
export const createResolverImportDraft = (
  records: ProfileRecordsResult,
): ProfileRecords => {
  const draft = transformProfileRecords(records)
  const roundTrip = transformToServiceFormat(draft)
  const rawRecords = records.texts.filter(
    (record) =>
      !roundTrip.texts.some(
        (value) => value.key === record.key && value.value === record.value,
      ),
  )
  return {
    ...draft,
    links: rawRecords.some((record) => record.key === 'links')
      ? []
      : draft.links,
    agentRegistrations: [],
    unknown: [
      ...draft.unknown,
      ...rawRecords.filter(
        (record) => !draft.unknown.some((value) => value.key === record.key),
      ),
    ],
  }
}
