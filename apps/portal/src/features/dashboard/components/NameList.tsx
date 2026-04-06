import type { NameWithRelation } from '@ensdomains/ensjs/subgraph'
import { useQueries } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { GripHorizontal } from 'lucide-react'
import type { Address } from 'viem/accounts'
import { CopyableRecord } from '@/components/CopyableRecord'
import { DataTable } from '@/components/DataTable'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { Badge } from '@/components/ui/badge'
import { NameMobileCard } from '@/features/names/components/NameMobileCard'
import { NameAvatar } from '@/features/profile/components/NameAvatar'
import { decodeRoleBitmap } from '@/lib/roles/decodeRoleBitmap'
import { formatDateTime } from '@/utils/formatting/formatDateTime'
import { type MergedName, mergeNamesData } from '@/utils/names/mergeNamesData'
import { dateToplainDate } from '@/utils/temporal'
import type { WithEnsNetwork } from '@/utils/types'
import { getV1NamesForAddressQueryOptions } from '../hooks/useV1NamesForAddress'
import { getV2NamesWithRolesForAddressQueryOptions } from '../hooks/useV2NamesWithRolesForAddress'

interface NameListProps {
  readonly address: Address
  readonly limit?: number
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
    cell: ({ row }) => {
      const expiryDate = row.original.expiryDate
      if (!expiryDate) {
        return (
          <Badge variant="secondary" className="text-xs">
            Does not expire
          </Badge>
        )
      }
      return formatDateTime(dateToplainDate(expiryDate))
    },
  },
  {
    accessorKey: 'roleBitmap',
    header: 'Roles',
    cell: ({ row }) => {
      const roleBitmap = row.original.roleBitmap
      const v1Roles = row.original.v1Roles

      // V2 names: use roleBitmap
      if (roleBitmap) {
        const roles = decodeRoleBitmap(roleBitmap)
        if (roles.length === 0) return null

        return (
          <Badge variant="secondary" className="text-xs">
            {roles.length} {roles.length === 1 ? 'Role' : 'Roles'}
          </Badge>
        )
      }

      // V1 names: use v1Roles (owner/manager)
      if (v1Roles) {
        const roleLabels: string[] = []
        if (v1Roles.owner) roleLabels.push('Owner')
        if (v1Roles.manager) roleLabels.push('Manager')

        if (roleLabels.length === 0) return null

        return (
          <div className="flex flex-row gap-1">
            {roleLabels.map((label) => (
              <Badge key={label} variant="secondary" className="text-xs">
                {label}
              </Badge>
            ))}
          </div>
        )
      }

      return null
    },
  },
]

export const NameList = ({ address, limit }: NameListProps) => {
  const [v1NamesQuery, v2NamesQuery] = useQueries({
    queries: [
      getV1NamesForAddressQueryOptions({ address }),
      getV2NamesWithRolesForAddressQueryOptions({ address }),
    ],
  })

  if (v1NamesQuery.error) {
    return <div>Error: {v1NamesQuery.error.cause?.message}</div>
  }
  if (v1NamesQuery.isLoading) return <LoadingSpinner title="Loading V1 names" />
  if (v2NamesQuery.isLoading) return <LoadingSpinner title="Loading V2 names" />
  if (!v2NamesQuery.data && !v1NamesQuery.data) return <>No names</>

  const allData = mergeNamesData(v1NamesQuery.data, v2NamesQuery.data)
  const data = limit ? allData.slice(0, limit) : allData

  return (
    <div className="border rounded-2xl border-border overflow-hidden">
      {/* Mobile view - Card layout */}
      <div className="md:hidden">
        {data.map((name, index) => (
          <NameMobileCard
            key={`${name.name}-${index}`}
            name={name.name}
            expiryDate={name.expiryDate}
            roleBitmap={name.roleBitmap}
            v1Roles={name.v1Roles}
            recordCount={name.recordCount}
            subdomainCount={name.subdomainCount}
            showCheckbox={false}
          />
        ))}
      </div>

      {/* Desktop view - Table layout */}
      <div className="hidden md:block">
        <DataTable data={data} columns={columns} />
      </div>

      <Link
        to="/addr/$addr/names"
        params={{ addr: address }}
        className="flex items-center justify-center gap-1 bg-quartz-50 p-4 text-sm font-medium hover:bg-quartz-100 transition-colors"
      >
        <GripHorizontal className="size-4" />
        Go to full list ({allData.length})
      </Link>
    </div>
  )
}
