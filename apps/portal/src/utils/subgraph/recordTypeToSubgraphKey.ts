import type { NameRecord } from '@/features/records/components/RecordsTable/columns'

export type RecordKey = 'coins' | 'texts' | 'contentHash'

export const recordTypeToSubgraphKey = (
  type: NameRecord['type'],
): RecordKey => {
  switch (type) {
    case 'address':
      return 'coins'
    case 'text':
      return 'texts'
    case 'contentHash':
      return 'contentHash'
    default:
      return type
  }
}
