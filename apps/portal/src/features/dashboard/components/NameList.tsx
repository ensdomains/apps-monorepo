import type { NameWithRelation } from '@ensdomains/ensjs/subgraph'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import type { Address } from 'viem/accounts'
import { NamechainSVG } from '@/assets/chains'
import { CopyableRecord } from '@/components/molecules/CopyableRecord'
import { DataTable } from '@/components/molecules/DataTable/DataTable'
import { LoadingSpinner } from '@/components/molecules/LoadingSpinner'
import { NameAvatar } from '@/features/profile/components/NameAvatar'
import { getNamesForAddressQueryOptions } from '../hooks/useNamesForAddress'

interface NameListProps {
  address: Address
}

const formatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
})

const columns: ColumnDef<NameWithRelation & { network: 'sepolia' }>[] = [
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
    accessorFn: ({ expiryDate }) => formatter.format(expiryDate?.date),
  },
  {
    accessorKey: 'network',
    header: 'Network',
    cell(cell) {
      const network = cell.getValue() as 'sepolia'

      return (
        <div className="flex flex-row gap-1 items-center">
          <NamechainSVG height={20} width={20} />
          <span>{network === 'sepolia' ? 'Sepolia' : 'Unknown'}</span>
        </div>
      )
    },
  },
]

export const NameList = ({ address }: NameListProps) => {
  const {
    data: names,
    isLoading,
    error,
  } = useQuery(getNamesForAddressQueryOptions({ address }))

  if (error) {
    if (error._tag === 'Wagmi/ClientError')
      return <div>Error connecting to Ethereum</div>
    return <div>Error: {error.cause?.message}</div>
  }
  if (isLoading) return <LoadingSpinner title="Loading..." />

  if (!names) return <>No names</>

  const data = names.map((name) => ({ ...name, network: 'sepolia' }) as const)

  return (
    <div className="border rounded-2xl border-gray-300">
      <DataTable data={data} columns={columns} />
    </div>
  )
}
