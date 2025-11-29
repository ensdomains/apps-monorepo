import type { GetNameRolesAccountsReturnType } from '@ensdomains/ensjs/public/v2'
import type { RoleName } from '@ensdomains/ensjs/utils/v2'
import type { ColumnDef } from '@tanstack/react-table'
import type { Address } from 'viem'
import { DataTable } from '@/components/molecules/DataTable/DataTable'

export type RolesTableProps = {
  title: string
  roles: GetNameRolesAccountsReturnType
}

export type AccountRoleColumnDef = {
  account: Address
  role: RoleName<string[]>
}

const columns: ColumnDef<AccountRoleColumnDef>[] = [
  {
    header: 'Role',
    accessorKey: 'role',
  },
  {
    header: 'Account',
    accessorKey: 'account',
  },
]

export const RolesTable = ({ title, roles }: RolesTableProps) => {
  const data: AccountRoleColumnDef[] = Array.from(roles.entries()).flatMap(
    ([account, roleNames]) =>
      roleNames.map((role) => ({
        account,
        role: role as RoleName<string[]>,
      })),
  )

  return (
    <div>
      <h2>{title}</h2>
      <DataTable data={data} columns={columns} />
    </div>
  )
}
