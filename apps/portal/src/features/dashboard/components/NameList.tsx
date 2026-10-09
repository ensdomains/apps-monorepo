import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { GripHorizontal } from 'lucide-react'
import type { Address } from 'viem/accounts'
import { DataTable } from '@/components/DataTable'
import { EntityBadge } from '@/components/EntityBadge'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { NoResultsMessage } from '@/components/NoResultsMessage'
import { Badge } from '@/components/ui/badge'
import { partitionOwnedNames } from '@/features/address/nameAttribution'
import { NameMobileCard } from '@/features/names/components/NameMobileCard'
import { RelationBadges } from '@/features/names/components/RelationBadges'
import { GraceBadge } from '@/features/profile/components/GraceBadge'
import { getNameStatus } from '@/features/renew/utils/nameExtension'
import { formatDateTime } from '@/utils/formatting/formatDateTime'
import type { AddressNameItem } from '@/utils/names/addressNames'
import { dateToPlainDate } from '@/utils/temporal'
import { getAddressNamesQueryOptions } from '../hooks/useAddressNames'

interface NameListProps {
  readonly address: Address
  readonly limit?: number
}

type column = AddressNameItem

const NameCell = ({ name }: { name: string }) => (
  <EntityBadge variant="name" name={name} showAvatar>
    {name}
  </EntityBadge>
)

const columns: ColumnDef<column>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
    cell: ({ getValue }) => {
      const name = getValue() as AddressNameItem['name']
      return name ? <NameCell name={name} /> : null
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
      const isV2 = row.original.protocolVersion === 'ENSv2'
      const status = getNameStatus(expiryDate, isV2)
      return (
        <div className="flex items-center gap-2">
          <span>{formatDateTime(dateToPlainDate(expiryDate))}</span>
          {status === 'grace' && <GraceBadge />}
        </div>
      )
    },
  },
  {
    id: 'relations',
    header: 'Roles',
    cell: ({ row }) => (
      <RelationBadges
        relations={row.original.relations}
        roleCount={row.original.roleCount}
      />
    ),
  },
]

export const NameList = ({ address, limit }: NameListProps) => {
  const namesQuery = useQuery(getAddressNamesQueryOptions({ address }))

  if (namesQuery.isLoading) return <LoadingSpinner title="Loading names" />

  // Registry ownership alone does not make a name the address's: any parent owner
  // can point a subname at any address. Names granted that way are kept visible, but
  // in their own group rather than among the names the address holds.
  const { acquired: allData, assigned } = partitionOwnedNames(
    namesQuery.data ?? [],
  )
  const data = limit ? allData.slice(0, limit) : allData
  // The assigned section is hidden in the limited (preview) view, so it only
  // counts as something to show when the full list is rendered.
  const showAssigned = !limit && assigned.length > 0

  if (data.length === 0 && !showAssigned && !namesQuery.error)
    return (
      <NoResultsMessage
        title="No names yet"
        description="Names owned by this address will appear here."
        className="mx-0 my-0"
      />
    )

  return (
    <div>
      {namesQuery.error && (
        <ErrorMessage
          compact
          description="Error fetching names. Please refresh the page."
          className="mb-4"
        />
      )}
      {/* Mobile view - Card layout */}
      <div className="md:hidden">
        {data.map((name) => (
          <NameMobileCard
            key={name.name}
            name={name.name}
            expiryDate={name.expiryDate}
            relations={name.relations}
            protocolVersion={name.protocolVersion}
            recordCount={name.recordCount}
            subdomainCount={name.subdomainCount}
            showCheckbox={false}
          />
        ))}
      </div>

      {/* Desktop view - Table layout */}
      {data.length > 0 && (
        <div className="hidden md:block">
          <DataTable data={data} columns={columns} />
        </div>
      )}

      {showAssigned && (
        <section className="flex flex-col gap-2 border-t border-border pt-6 mt-6">
          <h3 className="text-sm font-medium">
            {`Names assigned to this address (${assigned.length})`}
          </h3>
          <p className="text-sm text-muted-foreground">
            Anyone who owns a name can point a subname at any address. These
            were granted by someone else's name, not acquired by this address.
          </p>
          <div className="md:hidden">
            {assigned.map((name) => (
              <NameMobileCard
                key={name.name}
                name={name.name}
                expiryDate={name.expiryDate}
                relations={name.relations}
                protocolVersion={name.protocolVersion}
                recordCount={name.recordCount}
                subdomainCount={name.subdomainCount}
                showCheckbox={false}
              />
            ))}
          </div>
          <div className="hidden md:block">
            <DataTable data={assigned} columns={columns} />
          </div>
        </section>
      )}

      {allData.length > 0 && (
        <Link
          to="/addr/$addr/names"
          params={{ addr: address }}
          className="flex items-center justify-center gap-1 border-t border-border p-4 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <GripHorizontal className="size-4" />
          Go to full list ({allData.length})
        </Link>
      )}
    </div>
  )
}
