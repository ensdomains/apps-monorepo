import type { ColumnDef } from '@tanstack/react-table'
import { ArrowUpDown } from 'lucide-react'
import { NamechainSVG } from '@/assets/chains'
import { CopyableRecord } from '@/components/CopyableRecord'
import { Checkbox } from '@/components/ui/checkbox'
import { NameAvatar } from '@/features/profile/components/NameAvatar'
import { formatDateTime } from '@/utils/formatting/formatDateTime'
import type { EnsNetworkName, WithEnsNetwork } from '@/utils/types'

export type NameRow = WithEnsNetwork<{
  name: string | null
  expiryDate?: Date | null
}>

const SortButton = ({ children, ...props }: React.ComponentProps<'button'>) => {
  return (
    <button
      className="p-0 flex flex-row items-center cursor-pointer"
      type="button"
      {...props}
    >
      {children}
      <ArrowUpDown className="ml-2 h-4 w-4" />
    </button>
  )
}

export const columns: ColumnDef<NameRow>[] = [
  {
    enableSorting: false,
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && 'indeterminate')
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
  },
  {
    accessorKey: 'name',
    header: ({ column }) => (
      <SortButton
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Name
      </SortButton>
    ),
    cell(cell) {
      const name = cell.getValue() as string

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
    accessorKey: 'expiryDate',
    header: ({ column }) => (
      <SortButton
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Expiry
      </SortButton>
    ),
    cell: ({ row }) => {
      const expiryDate = row.original.expiryDate
      return expiryDate ? formatDateTime(expiryDate) : null
    },
  },
  {
    accessorKey: 'network',
    header: ({ column }) => (
      <SortButton
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Network
      </SortButton>
    ),
    cell(cell) {
      const network = cell.getValue() as EnsNetworkName

      if (network === 'sepolia') {
        return (
          <div className="flex flex-row gap-1 items-center">
            <NamechainSVG height={20} width={20} />
            <span>Sepolia</span>
          </div>
        )
      }

      if (network === 'namechainSepolia') {
        return (
          <div className="flex flex-row gap-1 items-center">
            <NamechainSVG height={20} width={20} />
            <span>Namechain Sepolia</span>
          </div>
        )
      }

      return null
    },
  },
]
