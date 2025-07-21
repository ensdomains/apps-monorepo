import type { GetRecordsReturnType } from '@ensdomains/ensjs/public'
import { DataTable } from '@/components/molecules/DataTable/DataTable'
import { columns } from './columns';


type Entries<T> = {
  [K in keyof T]-?: [K, T[K]];
}[keyof T][];


const recordsToTableData = (records: GetRecordsReturnType) => {
  const data: { key?: string, value: string, type: string; id?: number }[] = []

  console.log(records)

  for (const [key, value] of Object.entries(records) as Entries<GetRecordsReturnType>) {
    if (key === 'contentHash' && value) {
      data.push({ type: key, value: `${value.protocolType}://${value.decoded}` })
    }
    if (key === 'texts') {
      for (const { key, value: text } of Object.values(value)) {
        data.push({ key, value: text, type: 'text' })
      }
    }
    if (key === 'coins') {
      for (const { name, value: addr, id } of Object.values(value)) {
        data.push({ key: name, value: addr, type: 'coin', id })
      }
    }
  }

  return data
}

export const RecordsTable = ({
  records,
}: {
  records: GetRecordsReturnType
}) => {
  return <DataTable columns={columns} data={recordsToTableData(records)} />
}
