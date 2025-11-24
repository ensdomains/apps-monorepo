import type { NameWithRelation } from '@ensdomains/ensjs/subgraph'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import type { Address } from 'viem/accounts'
import { DataTable } from '@/components/molecules/DataTable/DataTable'
import { LoadingSpinner } from '@/components/molecules/LoadingSpinner'
import { getNamesForAddressQueryOptions } from '../hooks/useNamesForAddress'

interface NameListProps {
  address: Address
}

const formatter = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const columns: ColumnDef<NameWithRelation>[] = [
  {
    accessorKey: 'name',
  },
  {
    id: 'expiryDate',
    accessorFn: ({ expiryDate }) => formatter.format(expiryDate?.date),
  },
]

export const NameList = ({ address }: NameListProps) => {
  const { data, isLoading, error } = useQuery(
    getNamesForAddressQueryOptions({ address }),
  )

  if (error) {
    if (error._tag === 'Wagmi/ClientError')
      return <div>Error connecting to Ethereum</div>
    return <div>Error: {error.cause?.message}</div>
  }
  if (isLoading) return <LoadingSpinner title="Loading..." />

  if (!data) return <>No data</>

  return <DataTable data={data} columns={columns} />
}
