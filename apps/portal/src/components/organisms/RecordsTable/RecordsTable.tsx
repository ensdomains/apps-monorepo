import { DataTable } from "@/components/molecules/DataTable/DataTable"
import { columns } from "./columns"

export const RecordsTable = () => {
  return <DataTable columns={columns} data={[
    {
      key: 'contentHash',
      value: 'whaetevs',
      type: 'contentHash'
    },
    {
      key: 'eth',
      value: '0x123',
      type: 'coinType'
    }
  ]} />
}