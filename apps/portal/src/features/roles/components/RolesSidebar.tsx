import type { Role } from '@ensdomains/ensjs/utils/v2'
import type { Row } from '@tanstack/react-table'
import { CheckCircle, Clock, Trash2 } from 'lucide-react'
import { type PropsWithChildren, useMemo, useState } from 'react'
import type { Address } from 'viem'
import { useWalletClient } from 'wagmi'
import { CopyButton } from '@/components/CopyButton'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

import { RoleHistoryTable } from '@/features/roles/components/RoleHistoryTable'
import { useEditedPermissions } from '@/features/roles/hooks/useEditedPermissions'
import { useGrantRoles } from '@/features/roles/hooks/useGrantRoles'
import { useRevokeRoles } from '@/features/roles/hooks/useRevokeRoles'
import type {
  PendingRemove,
  PendingSave,
} from '@/features/roles/utils/buildRoleTransactionDescriptors'
import { buildRoleTransactions } from '@/features/roles/utils/buildRoleTransactions'
import { TransactionModal } from '@/features/transaction-manager/components/TransactionModal'
import { useTransactionModal } from '@/features/transaction-manager/hooks/useTransactionModal'
import { useIsMobile } from '@/hooks/use-mobile'
import { isManagerRoleSettable, permissions } from '@/lib/roles/permissions'
import {
  computeRoleChanges,
  hasPermissionsChanged,
  roleToPermissions,
} from '@/lib/roles/rolesToPermissions'
import { cn } from '@/lib/utils'
import { namechainSepolia } from '@/lib/wagmi'

type RolesSidebarProps<TData extends { items: string[]; account: Address }> =
  PropsWithChildren<{
    row: Row<TData> | null
    open: boolean
    setOpen: React.Dispatch<React.SetStateAction<boolean>>
    name: string
    canManageRoles: boolean
  }>

export const RolesSidebar = <
  TData extends { items: string[]; account: Address },
>({
  children,
  row,
  open,
  setOpen,
  name,
  canManageRoles,
}: RolesSidebarProps<TData>) => {
  const isMobile = useIsMobile()
  const chainId = namechainSepolia.id
  const [confirmOpen, setConfirmOpen] = useState(false)

  const [pendingSave, setPendingSave] = useState<PendingSave | null>(null)
  const [pendingRemove, setPendingRemove] = useState<PendingRemove | null>(null)

  const { data: walletClient } = useWalletClient({ chainId })
  const { openModal, closeModal, clearTransaction } = useTransactionModal()

  const { grantRoles } = useGrantRoles()
  const { revokeRoles } = useRevokeRoles()

  const selectedAccount = row?.original.account
  const originalRoles = useMemo(
    () => (row?.original.items ?? []) as Role[],
    [row],
  )

  const { editedPermissions, setEditedPermissions } = useEditedPermissions(row)

  const hasChanges = hasPermissionsChanged(
    roleToPermissions(originalRoles),
    editedPermissions,
  )
  const { rolesToGrant, rolesToRevoke } = computeRoleChanges(
    originalRoles,
    editedPermissions,
  )

  const handleDone = () => {
    closeModal()
    clearTransaction()
    setPendingSave(null)
    setPendingRemove(null)
    setOpen(false)
  }

  const handleSaveChanges = () => {
    if (!selectedAccount || !hasChanges || !walletClient?.account) return

    setOpen(false)
    setPendingSave({
      account: selectedAccount,
      rolesToGrant: rolesToGrant as Role[],
      rolesToRevoke: rolesToRevoke as Role[],
    })
    setPendingRemove(null)
    openModal()
  }

  const handleRemoveUser = () => {
    if (
      !selectedAccount ||
      originalRoles.length === 0 ||
      !walletClient?.account
    )
      return

    setConfirmOpen(false)
    setOpen(false)
    setPendingRemove({
      account: selectedAccount,
      roles: originalRoles,
    })
    setPendingSave(null)
    openModal()
  }

  const handlePermissionChange = (
    roleKey: string,
    permissionType: 'admin' | 'manager',
    checked: boolean,
  ) => {
    setEditedPermissions((prev) => {
      const newMap = new Map(prev)
      const current = newMap.get(roleKey) || { admin: false, manager: false }
      newMap.set(roleKey, { ...current, [permissionType]: checked })
      return newMap
    })
  }

  const isWalletConnected = Boolean(walletClient?.account)

  const transactions = buildRoleTransactions(pendingSave, pendingRemove, name, {
    grantRoles: (params) =>
      grantRoles({
        ...params,
        roles: [...params.roles],
      }),
    revokeRoles: (params) =>
      revokeRoles({
        ...params,
        roles: [...params.roles],
      }),
    handleDone,
  })

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen} defaultOpen={false}>
        {children}
        <SheetContent
          side={isMobile ? 'bottom' : 'right'}
          className="sm:max-w-[880px] bg-white overflow-y-auto p-8"
        >
          <div className="p-6 flex flex-col gap-6 h-screen">
            <SheetHeader className="p-0">
              <SheetTitle className="font-sans text-heading font-medium">
                Role Details
              </SheetTitle>
            </SheetHeader>

            {row ? (
              <div className="flex flex-col gap-6">
                {/* Header */}
                <div className="flex flex-wrap justify-between items-center gap-4">
                  <div className="flex items-center gap-1">
                    <h2 className="text-4xl font-medium leading-snug">
                      {name}
                    </h2>
                    <CopyButton value={name} />
                  </div>
                  {canManageRoles && selectedAccount && (
                    <Button
                      variant="secondary"
                      disabled={!isWalletConnected}
                      onClick={() => setConfirmOpen(true)}
                    >
                      <Trash2 className="size-5" />
                      Remove user
                    </Button>
                  )}
                </div>

                {/* Permissions Section */}
                <div className="border border-border rounded-2xl overflow-hidden">
                  {permissions.map((permission, index) => {
                    const roleKey = permission.key
                    const isManagerRoleDisabled = !isManagerRoleSettable(
                      permission.key,
                    )
                    const rolePerms = editedPermissions.get(roleKey) || {
                      admin: false,
                      manager: false,
                    }

                    return (
                      <div
                        key={permission.key}
                        className={cn(
                          'flex items-center justify-between px-6 py-4 gap-4',
                          index !== 0 && 'border-t border-border',
                          isManagerRoleDisabled && 'text-quartz-500',
                        )}
                      >
                        <div className="flex flex-col gap-1 flex-1 min-w-64">
                          <div className="font-medium">{permission.title}</div>
                          <div className="text-sm text-quartz-500">
                            {permission.description}
                          </div>
                        </div>
                        <div className="flex items-center gap-4 flex-1 min-w-64 justify-end">
                          <div className="flex items-center gap-2 min-w-24">
                            <Checkbox
                              id={`${permission.key}-manager`}
                              checked={rolePerms.manager}
                              disabled={
                                !canManageRoles || isManagerRoleDisabled
                              }
                              onCheckedChange={(checked) =>
                                handlePermissionChange(
                                  roleKey,
                                  'manager',
                                  checked as boolean,
                                )
                              }
                              className="data-[state=checked]:bg-citrine-500 data-[state=checked]:border-citrine-500"
                            />
                            <Label
                              htmlFor={`${permission.key}-manager`}
                              className={cn(
                                'font-medium cursor-pointer',
                                canManageRoles
                                  ? 'text-black'
                                  : 'text-quartz-400',
                              )}
                            >
                              Manager
                            </Label>
                          </div>
                          <div className="flex items-center gap-2 min-w-24">
                            <Checkbox
                              id={`${permission.key}-admin`}
                              checked={rolePerms.admin}
                              disabled
                              className="data-[state=checked]:bg-citrine-500 data-[state=checked]:border-citrine-500"
                            />
                            <Label
                              htmlFor={`${permission.key}-admin`}
                              className={cn(
                                'font-medium cursor-pointer',
                                canManageRoles
                                  ? 'text-black'
                                  : 'text-quartz-400',
                              )}
                            >
                              Admin
                            </Label>
                          </div>
                        </div>
                      </div>
                    )
                  })}

                  {/* Save Changes Button */}
                  <div className="flex justify-end px-6 py-4 border-t border-border bg-quartz-0">
                    <Button
                      variant="secondary"
                      disabled={!hasChanges || !isWalletConnected}
                      onClick={handleSaveChanges}
                    >
                      <CheckCircle className="size-5" />
                      Save changes
                    </Button>
                  </div>
                </div>

                {/* History Section */}
                <div className="flex flex-col gap-4">
                  <div className="flex flex-wrap justify-between items-center gap-4">
                    <h3 className="text-2xl font-medium leading-snug">
                      History
                    </h3>
                    <Button variant="secondary">
                      <Clock className="size-4" />
                      Full history
                    </Button>
                  </div>

                  <div className="border border-border rounded-2xl overflow-hidden p-0">
                    <RoleHistoryTable name={name} account={selectedAccount} />
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-quartz-400 text-center py-12">
                No role selected
              </div>
            )}
          </div>

          {/* Remove User Confirmation Dialog */}
          <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Remove user</DialogTitle>
                <DialogDescription>
                  Are you sure you want to remove this user from all roles? This
                  action cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <Button
                  variant="destructive"
                  onClick={() => {
                    setConfirmOpen(false)
                    handleRemoveUser()
                  }}
                >
                  Remove
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </SheetContent>
      </Sheet>

      {transactions.length > 0 && (
        <TransactionModal transactions={transactions} />
      )}
    </>
  )
}
