import type { Row } from '@tanstack/react-table'
import type { PropsWithChildren } from 'react'
import { CopyableRecord } from '@/components/molecules/CopyableRecord'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useIsMobile } from '@/hooks/use-mobile'
import { roleDefinitions } from '@/routes/$name/add-user'

// Mock role data - TODO: replace with real data from row
const getMockRoleData = () => ({
  registrar: { manager: false, admin: true },
  renew: { manager: false, admin: true },
  setSubregistry: { manager: false, admin: true },
  setResolver: { manager: false, admin: true },
  setTokenObserver: { manager: false, admin: true },
  burn: { manager: false, admin: true },
  canTransferAdmin: { manager: false, admin: true },
})

type RolesSidebarProps<TData> = PropsWithChildren<{
  row: Row<TData> | null
  open: boolean
  setOpen: React.Dispatch<React.SetStateAction<boolean>>
}>

export const RolesSidebar = <TData extends { items: string[] }>({
  children,
  row,
  open,
  setOpen,
}: RolesSidebarProps<TData>) => {
  const isMobile = useIsMobile()

  return (
    <Sheet open={open} onOpenChange={setOpen} defaultOpen={false}>
      {children}
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className="sm:max-w-[880px] bg-white overflow-y-auto"
      >
        <div className="p-6 flex flex-col gap-6 h-screen">
          <SheetHeader>
            <SheetTitle className="font-sans text-[28px] font-medium">
              Role Details
            </SheetTitle>
          </SheetHeader>

          {row ? (
            <div className="flex flex-col gap-6">
              {/* Account Address Section */}
              <div className="flex flex-col gap-2">
                {(() => {
                  const rowData = row.original as Record<string, unknown>
                  // Find the account address from row data
                  const accountEntry = Object.entries(rowData).find(
                    ([, value]) => {
                      const stringValue = value as string
                      return (
                        typeof value === 'string' &&
                        stringValue.startsWith('0x') &&
                        stringValue.length === 42
                      )
                    },
                  )

                  if (accountEntry) {
                    const [, accountAddress] = accountEntry
                    const addressStr = accountAddress as string
                    return (
                      <CopyableRecord
                        value={addressStr}
                        displayValue={
                          <span className="text-xl">{addressStr}</span>
                        }
                      />
                    )
                  }
                  return null
                })()}
              </div>

              {/* Roles Section */}
              <div className="flex flex-col gap-4">
                <h3 className="text-lg font-medium">Roles</h3>
                <div className="border rounded-lg divide-y">
                  {roleDefinitions.map((role) => {
                    const roleData = getMockRoleData()
                    const permissions =
                      roleData[role.key as keyof typeof roleData]
                    return (
                      <div
                        key={role.key}
                        className="flex items-center justify-between p-4 gap-4"
                      >
                        <div className="flex flex-col gap-1 flex-1">
                          <div className="font-medium">{role.title}</div>
                          <div className="text-sm text-gray-600">
                            {role.description}
                          </div>
                        </div>
                        <div className="flex items-center gap-8">
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id={`${role.key}-manager`}
                              checked={permissions.manager}
                              disabled
                            />
                            <Label
                              htmlFor={`${role.key}-manager`}
                              className="font-normal cursor-pointer text-gray-600"
                            >
                              Manager
                            </Label>
                          </div>
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id={`${role.key}-admin`}
                              checked={permissions.admin}
                              disabled
                            />
                            <Label
                              htmlFor={`${role.key}-admin`}
                              className="font-normal cursor-pointer text-gray-600"
                            >
                              Admin
                            </Label>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-gray-400 text-center py-12">
              No role selected
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
