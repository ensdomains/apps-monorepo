import type { ColumnDef, Row } from '@tanstack/react-table'
import { Check, PanelRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Shared building blocks for the flat roles tables (name registry + resolver).
 * Each table supplies its own `getEntries` mapping from its row to the common
 * `RoleRowEntry[]`; the Role / Admin / Manager columns and the edit action are
 * identical across both, so they live here.
 */

export type RoleRowEntry = {
  label: string
  hasAdmin: boolean
  hasUser: boolean
}

export const GreenCheck = () => (
  <Check className="size-5 text-success-text bg-success-fill rounded-full p-1" />
)

export const GrayDot = () => (
  <div className="size-5 rounded-full bg-neutral-2" />
)

export const PermissionMark = ({ held }: { held: boolean }) =>
  held ? <GreenCheck /> : <GrayDot />

/** Role label + Admin/User check columns, vertically aligned per permission. */
export const buildRoleColumns = <T,>(
  getEntries: (row: T) => RoleRowEntry[],
): ColumnDef<T>[] => [
  {
    id: 'role',
    header: 'Role',
    cell: ({ row }) => (
      <div className="flex flex-col gap-0.5 text-muted-foreground">
        {getEntries(row.original).map((entry) => (
          <span
            className="font-mono pb-2 leading-5 h-5 box-content"
            key={entry.label}
          >
            {entry.label}
          </span>
        ))}
      </div>
    ),
  },
  {
    id: 'admin',
    header: () => <div className="text-center">Admin</div>,
    cell: ({ row }) => (
      <div className="flex flex-col items-center gap-0.5">
        {getEntries(row.original).map((entry) => (
          <div
            className="h-5 pb-2 box-content flex items-center"
            key={entry.label}
          >
            <PermissionMark held={entry.hasAdmin} />
          </div>
        ))}
      </div>
    ),
  },
  {
    id: 'user-level',
    header: () => <div className="text-center">Manager</div>,
    cell: ({ row }) => (
      <div className="flex flex-col items-center gap-0.5">
        {getEntries(row.original).map((entry) => (
          <div
            className="h-5 pb-2 box-content flex items-center"
            key={entry.label}
          >
            <PermissionMark held={entry.hasUser} />
          </div>
        ))}
      </div>
    ),
  },
]

/** Full-height edit action that opens the row's roles slider (admins only). */
export const buildEditActionColumn = <T,>(
  onEdit: (row: Row<T>) => void,
): ColumnDef<T> => ({
  id: 'actions',
  header: () => null,
  cell: ({ row }) => (
    <Button
      variant="secondary"
      aria-label="Edit user roles"
      className="absolute inset-0 h-auto w-8 rounded-sm p-0 my-4 flex items-center justify-center"
      onClick={() => onEdit(row)}
    >
      <PanelRight className="size-4 text-muted-foreground" />
    </Button>
  ),
})

/** Wrapper classes shared by both roles tables; `hasActions` enables the
 *  last-cell overrides that let the edit button fill its cell. */
export const rolesTableClassName = (hasActions: boolean) =>
  cn(
    '[&_td]:align-top [&_.overflow-x-auto]:overflow-visible [&_tbody_tr:hover]:bg-transparent',
    hasActions &&
      '[&_td:last-child]:p-0 [&_td:last-child]:w-12 [&_td:last-child]:relative',
  )
