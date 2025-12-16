import type { NameWithRelation } from '@ensdomains/ensjs/subgraph'
import { useQueries } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import type { Address } from 'viem/accounts'
import { NamechainSVG } from '@/assets/chains'
import { CopyableRecord } from '@/components/molecules/CopyableRecord'
import { DataTable } from '@/components/molecules/DataTable/DataTable'
import { LoadingSpinner } from '@/components/molecules/LoadingSpinner'
import { NameAvatar } from '@/features/profile/components/NameAvatar'
import type { EnsNetworkName, WithEnsNetwork } from '@/utils/types'
import { getV1NamesForAddressQueryOptions } from '../hooks/useV1NamesForAddress'
import { getV2NamesForAddressQueryOptions } from '../hooks/useV2NamesForAddress'

interface NameListProps {
  address: Address
}

const formatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
})

type column = WithEnsNetwork<{
  name: string | null
  expiryDate?: Date
}>

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
      return expiryDate ? formatter.format(expiryDate) : null
    },
  },
  {
    accessorKey: 'network',
    header: 'Network',
    cell(cell) {
      const network = cell.getValue() as EnsNetworkName

      if (network === 'sepolia') {
        return (
          <div className="flex flex-row gap-1 items-center">
            <NamechainSVG height={20} width={20} />
            <span>Sepolia</span>
          </div>
        )
      } else if (network === 'namechainSepolia') {
        return (
          <div className="flex flex-row gap-1 items-center">
            <NamechainSVG height={20} width={20} />
            <span>Namechain Sepolia</span>
          </div>
        )
      }
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

  const data = [
    ...((v1NamesQuery.data || []).map(({ name, expiryDate }) => ({
      name,
      expiryDate: expiryDate ? expiryDate.date : null,
      network: 'sepolia',
    })) as column[]),
    ...((v2NamesQuery.data || []).map(({ name, expiryDate }) => ({
      name,
      expiryDate: expiryDate ? new Date(Number(expiryDate) * 1000) : null,
      network: 'namechainSepolia',
    })) as column[]),
  ] as const satisfies column[]

  return (
    <div className="border rounded-2xl border-gray-300">
      <DataTable data={data} columns={columns} />
      <div className="bg-secondary p-4 text-center rounded-b-2xl">
        Full name list Coming Soon
      </div>
    </div>
  )
}
