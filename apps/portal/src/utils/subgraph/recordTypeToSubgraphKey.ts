import type { NameRecord } from '@/components/organisms/RecordsTable/columns'

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
