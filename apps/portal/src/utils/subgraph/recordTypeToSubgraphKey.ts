import type { NameRecord } from '@/features/records/components/RecordsTable/columns'

export const recordTypeToSubgraphKey = (type: NameRecord['type']) => {
  switch (type) {
    case 'address':
      return 'coins'
    case 'text':
      return 'texts'
    default:
      return type
  }
}
