import type { GetNameRolesAccountsReturnType } from '@ensdomains/ensjs/public/v2'
import type { ColumnDef } from '@tanstack/react-table'
import type { Address } from 'viem'
import { CopyableRecord } from '@/components/molecules/CopyableRecord'
import { AddressDisplay } from '@/components/organisms/HistoryTable/AddressDisplay'
import { GroupedDataTable } from '@/components/table/GroupedDataTable'
import { roleToPermissions } from '@/lib/roles/rolesToPermissions'

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

      return <AddressDisplay address={value} short={false} />
    },
  },
]

const RoleItemContainer = ({
  label,
  admin,
  manager,
  role,
}: {
  label: string
  admin: boolean
  manager: boolean
  role: string
}) => {
  return (
    <div className="flex flex-row justify-between items-center">
      <CopyableRecord
        className="capitalize px-6 py-4"
        displayValue={label}
        value={role}
      />
      <div className="w-full flex flex-row gap-4">
        {admin && (
          <div className="p-2 rounded-2xl flex items-center bg-secondary h-[26px]">
            Admin
          </div>
        )}
        {manager && (
          <div className="p-2 rounded-2xl flex items-center bg-secondary h-[26px]">
            Manager
          </div>
        )}
      </div>
    </div>
  )
}

const RoleItem = ({
  role,
  admin,
  manager,
}: {
  role: string
  admin: boolean
  manager: boolean
}) => {
  const roleLabel = role.replaceAll('_', ' ').toLowerCase()

  return <RoleItemContainer label={roleLabel} {...{ admin, manager, role }} />
}

const ItemsWrapper = ({ items }: { items: string[] }) => {
  const permissions = roleToPermissions(items)

  return (
    <>
      {Array.from(permissions.entries()).map(([role, { admin, manager }]) => (
        <RoleItem key={role} {...{ admin, manager, role }} />
      ))}
    </>
  )
}

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
      <GroupedDataTable<AccountGroup, string>
        data={data}
        columns={columns}
        itemsWrapper={ItemsWrapper}
      />
    </div>
  )
}
