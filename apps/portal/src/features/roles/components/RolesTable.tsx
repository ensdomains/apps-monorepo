import type { GetNameRolesAccountsReturnType } from '@ensdomains/ensjs/public/v2'
import type { ColumnDef } from '@tanstack/react-table'
import type { Address } from 'viem'
import { AddressDisplay } from '@/components/table/EventsDataTable/AddressDisplay'
import { GroupedDataTable } from '@/components/table/GroupedDataTable'

type RolesTableProps = {
  title?: string
  name: string
  canManageRoles: boolean
  owner?: Address
  roles: GetNameRolesAccountsReturnType
}

type AccountGroup = {
  items: string[]
  account: Address
}

const columns: ColumnDef<AccountGroup>[] = [
  {
    header: 'Role',
    accessorKey: 'account',
    cell(cell) {
      const value = cell.getValue() as Address

      return <AddressDisplay address={value} short={false} />
    },
  },
  {
    header: 'Permission',
    accessorKey: 'permissions',
    id: 'permissions',
    cell: () => <div className="min-w-[200px]">&nbsp;</div>, // Empty cell for main row, content shown in expanded row
  },
]

export const RolesTable = ({
  title,
  roles,
  name,
  canManageRoles,
  owner,
}: RolesTableProps) => {
  const data: AccountGroup[] = Array.from(roles.entries())
    .filter(([, roleNames]) => roleNames.length > 0)
    .map(([account, roleNames]) => ({
      account,
      items: roleNames,
    }))

  return (
    <div>
      {title && <h2>{title}</h2>}
      <GroupedDataTable<AccountGroup, string>
        data={data}
        columns={columns}
        name={name}
        canManageRoles={canManageRoles}
        owner={owner}
      />
    </div>
  )
}
