import type { GetNameRolesAccountsReturnType } from '@ensdomains/ensjs/public/v2'
import type { ColumnDef } from '@tanstack/react-table'
import type { Address } from 'viem'
import { AddressDisplay } from '@/components/organisms/HistoryTable/AddressDisplay'
import { GroupedDataTable } from '@/components/table/GroupedDataTable'

export type RolesTableProps = {
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

      return (
        <div>
          <AddressDisplay address={value} />
        </div>
      )
    },
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
