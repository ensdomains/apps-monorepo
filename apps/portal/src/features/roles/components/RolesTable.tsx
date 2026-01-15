import type { GetNameRolesAccountsReturnType } from '@ensdomains/ensjs/public/v2'
import type { ColumnDef } from '@tanstack/react-table'
import type { Address } from 'viem'
import { GroupedDataTable } from '@/components/table/GroupedDataTable'
import { AddressDisplay } from '@/components/table/HistoryTable/AddressDisplay'

type RolesTableProps = {
  title?: string
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

export const RolesTable = ({ title, roles }: RolesTableProps) => {
  const data: AccountGroup[] = Array.from(roles.entries()).map(
    ([account, roleNames]) => ({
      account,
      items: roleNames,
    }),
  )

  return (
    <div>
      {title && <h2>{title}</h2>}
      <GroupedDataTable<AccountGroup, string> data={data} columns={columns} />
    </div>
  )
}
