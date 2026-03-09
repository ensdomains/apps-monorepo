import type { Row } from '@tanstack/react-table'
import { UserIcon, UserLockIcon } from 'lucide-react'
import type { PropsWithChildren } from 'react'
import { CopyableRecord } from '@/components/CopyableRecord'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useIsMobile } from '@/hooks/use-mobile'
import { resolverPermissions } from '@/lib/roles/resolverRoles'
import { roleToPermissions } from '@/lib/roles/rolesToPermissions'
import { cn } from '@/lib/utils'
import type { AccountRoleGroup } from './ResolverRolesTable'

type ResolverRolesSidebarProps = PropsWithChildren<{
  readonly row: Row<AccountRoleGroup> | null
  readonly open: boolean
  readonly setOpen: React.Dispatch<React.SetStateAction<boolean>>
}>

export const ResolverRolesSidebar = ({
  children,
  row,
  open,
  setOpen,
}: ResolverRolesSidebarProps) => {
  const isMobile = useIsMobile()

  const selectedAccount = row?.original.account
  const decodedRoles = row?.original.decodedRoles ?? []
  const decodedPermissions = roleToPermissions(decodedRoles)

  return (
    <Sheet open={open} onOpenChange={setOpen} defaultOpen={false}>
      {children}
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className="sm:max-w-[880px] bg-white overflow-y-auto"
      >
        <div className="p-6 flex flex-col gap-6 h-screen">
          <SheetHeader className="p-0">
            <SheetTitle className="font-sans text-heading font-medium">
              Role Details
            </SheetTitle>
          </SheetHeader>

          {row ? (
            <div className="flex flex-col gap-6">
              {selectedAccount && (
                <div className="flex flex-col gap-2">
                  <CopyableRecord
                    value={selectedAccount}
                    displayValue={
                      <span className="text-xl">{selectedAccount}</span>
                    }
                  />
                </div>
              )}

              <div className="flex flex-col gap-4">
                <h3 className="text-lg font-medium">Roles</h3>
                <div className="border rounded-lg divide-y">
                  {resolverPermissions.map((permission) => {
                    const rolePerms = decodedPermissions.get(
                      permission.key,
                    ) || {
                      admin: false,
                      manager: false,
                    }
                    const hasAny = rolePerms.admin || rolePerms.manager

                    return (
                      <div
                        key={permission.key}
                        className={cn(
                          'flex items-center justify-between p-4 gap-4',
                          !hasAny && 'text-quartz-400',
                        )}
                      >
                        <div className="flex flex-col gap-1 flex-1">
                          <div className="font-medium">{permission.title}</div>
                          <div className="text-sm text-quartz-500">
                            {permission.description}
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          {rolePerms.manager && (
                            <div className="px-2 gap-1 rounded-2xl flex items-center bg-secondary h-[26px] text-sm">
                              <UserIcon width={16} height={16} /> Manager
                            </div>
                          )}
                          {rolePerms.admin && (
                            <div className="px-2 gap-1 rounded-2xl flex items-center bg-secondary h-[26px] text-sm">
                              <UserLockIcon width={16} height={16} /> Admin
                            </div>
                          )}
                          {!hasAny && (
                            <span className="text-sm text-quartz-400">
                              None
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-quartz-400 text-center py-12">
              No role selected
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
