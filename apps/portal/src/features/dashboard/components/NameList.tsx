import type { NameWithRelation } from '@ensdomains/ensjs/subgraph'
import { useQueries } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import type { Address } from 'viem/accounts'
import { CopyableRecord } from '@/components/CopyableRecord'
import { DataTable } from '@/components/DataTable'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { NameAvatar } from '@/features/profile/components/NameAvatar'
import { formatDateTime } from '@/utils/formatting/formatDateTime'
import { type MergedName, mergeNamesData } from '@/utils/names/mergeNamesData'
import type { WithEnsNetwork } from '@/utils/types'
import { getV1NamesForAddressQueryOptions } from '../hooks/useV1NamesForAddress'
import { getV2NamesForAddressQueryOptions } from '../hooks/useV2NamesForAddress'

interface NameListProps {
  address: Address
}

const MobileNameCard = ({ name }: { name: column }) => {
  return (
    <div className="flex flex-col gap-2 px-6 py-4 bg-white border-b border-gray-200 last:border-b-0">
      {/* Name row with avatar and copy */}
      <div className="flex flex-row gap-1 items-center">
        <NameAvatar
          name={name.name || ''}
          height="20px"
          width="20px"
          rounded="rounded-sm"
        />
        <CopyableRecord href={`/${name.name}`} value={name.name || ''} />
      </div>

      {/* Expiry section */}
      {name.expiryDate && (
        <>
          <div className="text-sm font-medium">Expiry</div>
          <div className="text-base">{formatDateTime(name.expiryDate)}</div>
        </>
      )}

      {/* Records and Subnames row */}
      <div className="flex gap-4 text-base">
        <div>
          <span className="font-medium">Records</span>{' '}
          <span>{name.recordCount ?? 0}</span>
        </div>
        <div>
          <span className="font-medium">Subnames</span>{' '}
          <span>{name.subdomainCount ?? 0}</span>
        </div>
      </div>
    </div>
  )
}

type column = WithEnsNetwork<MergedName>

const columns: ColumnDef<column>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
    cell(cell) {
      const name = cell.getValue() as NameWithRelation['name']

      if (!name) return null

      return (
        <div className="flex flex-row gap-1 items-center w-max">
          <NameAvatar
            name={name}
            height="20px"
            width="20px"
            rounded="rounded-sm"
          />
          <CopyableRecord href={`/${name}`} value={name} />
        </div>
      )
    },
  },
  {
    id: 'expiryDate',
    header: 'Expiry',
    accessorFn: ({ expiryDate }) => {
      return expiryDate ? formatDateTime(expiryDate) : null
    },
  },
  {
    accessorKey: 'recordCount',
    header: 'Records',
    cell(cell) {
      const recordCount = cell.getValue() as number | undefined
      return recordCount !== undefined ? recordCount.toString() : '0'
    },
  },
  {
    accessorKey: 'subdomainCount',
    header: 'Subnames',
    cell(cell) {
      const subdomainCount = cell.getValue() as number | undefined
      return subdomainCount !== undefined ? subdomainCount.toString() : '0'
    },
  },
]

export const NameList = ({ address }: NameListProps) => {
  const [v1NamesQuery, v2NamesQuery] = useQueries({
    queries: [
      getV1NamesForAddressQueryOptions({ address }),
      getV2NamesForAddressQueryOptions({ address }),
    ],
  })

  if (v1NamesQuery.error) {
    return <div>Error: {v1NamesQuery.error.cause?.message}</div>
  }
  if (v1NamesQuery.isLoading) return <LoadingSpinner title="Loading V1 names" />
  if (v2NamesQuery.isLoading) return <LoadingSpinner title="Loading V2 names" />
  if (!v2NamesQuery.data && !v1NamesQuery.data) return <>No names</>

  const data = mergeNamesData(v1NamesQuery.data, v2NamesQuery.data)

  return (
    <div className="border rounded-2xl border-gray-300 overflow-hidden">
      {/* Mobile view - Card layout */}
      <div className="md:hidden">
        {data.map((name, index) => (
          <MobileNameCard key={`${name.name}-${index}`} name={name} />
        ))}
      </div>

      {/* Desktop view - Table layout */}
      <div className="hidden md:block">
        <DataTable data={data} columns={columns} />
      </div>

      <div className="bg-secondary p-4 text-center">
        Full name list Coming Soon
      </div>
    </div>
  )
}
