import type { ColumnDef } from '@tanstack/react-table'
import { CheckCircle2, SquareUser, XCircle } from 'lucide-react'
import { SortButton } from '@/components/table/SortButton'
import { Badge } from '@/components/ui/badge'
import type { ReverseResolutionResult } from '../../hooks/useReverseResolution'

export const columns: ColumnDef<ReverseResolutionResult>[] = [
  {
    accessorKey: 'label',
    header: ({ column }) => (
      <SortButton
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        sortDirection={column.getIsSorted()}
      >
        Network
      </SortButton>
    ),
    cell: ({ row }) => {
      const label = row.original.label
      const icon = row.original.icon
      const isDefault = row.original.reverseRegistrarChainId === 60

      return (
        <div className="flex flex-row items-center gap-2">
          {icon && <img src={icon} alt={label} className="w-5 h-5" />}
          <span className={isDefault ? 'font-medium' : ''}>{label}</span>
        </div>
      )
    },
  },
  {
    accessorKey: 'name',
    header: ({ column }) => (
      <SortButton
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        sortDirection={column.getIsSorted()}
      >
        Name
      </SortButton>
    ),
    cell: ({ row }) => {
      const name = row.original.name
      const defaultName = row.original.defaultName
      const isDefaultCoin = row.original.reverseRegistrarChainId === 60

      // If no name but has defaultName and is not the default coin itself
      if (!name && defaultName && !isDefaultCoin) {
        return (
          <div className="flex flex-row items-center gap-2">
            <span>{defaultName}</span>
            <Badge variant="outline" className="text-xs">
              Default
            </Badge>
          </div>
        )
      }

      if (!name) {
        return <span className="text-muted-foreground">null</span>
      }

      return (
        <div className="flex flex-row items-center gap-2">
          <span>{name}</span>
          {!row.original.normalized && (
            <Badge variant="secondary" className="text-xs">
              Not normalized
            </Badge>
          )}
        </div>
      )
    },
  },
  {
    accessorKey: 'forwardMatch',
    header: ({ column }) => (
      <SortButton
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        sortDirection={column.getIsSorted()}
      >
        Forward match
      </SortButton>
    ),
    cell: ({ row }) => {
      const name = row.original.name
      const forwardMatch = row.original.forwardMatch
      const defaultName = row.original.defaultName
      const isDefaultCoin = row.original.reverseRegistrarChainId === 60

      if (!name && defaultName && !isDefaultCoin) {
        return (
          <div className="flex flex-row items-center gap-2">
            <Badge variant="outline" className="text-xs">
              <CheckCircle2 className="w-4 h-4" />
              <span>True</span>
            </Badge>
            <Badge variant="outline" className="text-xs">
              <SquareUser className="w-4 h-4" />
              <span>Primary name</span>
            </Badge>
            <Badge variant="outline" className="text-xs">
              Default
            </Badge>
          </div>
        )
      }

      if (!name) {
        return (
          <div className="flex flex-row items-center gap-2 text-muted-foreground">
            <Badge variant="outline" className="text-xs">
              <XCircle className="w-4 h-4" />
              <span>False</span>
            </Badge>
          </div>
        )
      }

      return (
        <div className="flex flex-row items-center gap-2">
          {forwardMatch ? (
            <>
              <Badge variant="outline" className="text-xs">
                <CheckCircle2 className="w-4 h-4" />
                <span>True</span>
              </Badge>
              <Badge variant="outline" className="text-xs">
                <SquareUser className="w-4 h-4" />
                <span>Primary name</span>
              </Badge>
            </>
          ) : (
            <Badge variant="outline" className="text-xs">
              <XCircle className="w-4 h-4" />
              <span>False</span>
            </Badge>
          )}
        </div>
      )
    },
  },
]
