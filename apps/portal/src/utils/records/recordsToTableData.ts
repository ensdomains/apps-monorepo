import type { GetRecordsReturnType } from '@ensdomains/ensjs/public'
import type { NameRecord } from '@/components/organisms/RecordsTable/columns'

type Entries<T> = {
  [K in keyof T]-?: [K, T[K]]
}[keyof T][]

export const recordsToTableData = (
  records: GetRecordsReturnType,
): NameRecord[] => {
  const data: NameRecord[] = []

  for (const [key, value] of Object.entries(
    records,
  ) as Entries<GetRecordsReturnType>) {
    if (key === 'contentHash' && value) {
      data.push({
        type: key,
        value: `${value.protocolType}://${value.decoded}`,
      })
    }
    if (key === 'texts') {
      for (const { key, value: text } of Object.values(value)) {
        data.push({ key, value: text, type: 'text' })
      }
    }
    if (key === 'coins') {
      for (const { coinType, value: addr, symbol } of Object.values(value)) {
        data.push({ key: symbol, value: addr, type: 'address', id: coinType })
      }
    }
  }

  return data
}
