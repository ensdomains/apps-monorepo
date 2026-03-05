import type { Role } from '@ensdomains/ensjs/utils/v2'
import type { Row } from '@tanstack/react-table'
import { Save, Trash2 } from 'lucide-react'
import { type PropsWithChildren, useCallback, useMemo, useState } from 'react'
import type { Address } from 'viem'
import { useWalletClient } from 'wagmi'
import { CopyableRecord } from '@/components/CopyableRecord'
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
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useEditedPermissions } from '@/features/roles/hooks/useEditedPermissions'
import { useGrantRoles } from '@/features/roles/hooks/useGrantRoles'
import { useRevokeRoles } from '@/features/roles/hooks/useRevokeRoles'
import { TransactionModal } from '@/features/transaction-manager/components/TransactionModal'
import { useTransactionModal } from '@/features/transaction-manager/hooks/useTransactionModal'
import type { Transaction } from '@/features/transaction-manager/types'
import { useIsMobile } from '@/hooks/use-mobile'
import { isManagerRoleSettable, permissions } from '@/lib/roles/permissions'
import {
  computeRoleChanges,
  hasPermissionsChanged,
  roleToPermissions,
} from '@/lib/roles/rolesToPermissions'
import { cn } from '@/lib/utils'
import { namechainSepolia } from '@/lib/wagmi'

const GRANT_ROLES_TX_ID = 'tx-grant-roles'
const REVOKE_ROLES_TX_ID = 'tx-revoke-roles'

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

  const [pendingSave, setPendingSave] = useState<{
    account: Address
    rolesToGrant: Role[]
    rolesToRevoke: Role[]
  } | null>(null)

  const [pendingRemove, setPendingRemove] = useState<{
    account: Address
    roles: Role[]
  } | null>(null)

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

  const handleDone = useCallback(() => {
    closeModal()
    clearTransaction()
    setPendingSave(null)
    setPendingRemove(null)
    setOpen(false)
  }, [closeModal, clearTransaction, setOpen])

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

  // Build transactions for the modal
  const transactions: Transaction[] = useMemo(() => {
    if (pendingSave) {
      const {
        account,
        rolesToGrant: toGrant,
        rolesToRevoke: toRevoke,
      } = pendingSave
      const txList: Transaction[] = []

      if (toGrant.length > 0) {
        const hasRevoke = toRevoke.length > 0
        txList.push({
          id: GRANT_ROLES_TX_ID,
          title: 'Grant roles',
          transactionName: `Grant roles for ${name}`,
          estimatedGasCost: 0.0001,
          onStart: () =>
            grantRoles({
              name,
              account,
              roles: toGrant,
              id: GRANT_ROLES_TX_ID,
            }),
          onDone: hasRevoke
            ? () =>
                revokeRoles({
                  name,
                  account,
                  roles: toRevoke,
                  id: REVOKE_ROLES_TX_ID,
                })
            : handleDone,
        })
      }

      if (toRevoke.length > 0) {
        txList.push({
          id: REVOKE_ROLES_TX_ID,
          title: 'Revoke roles',
          transactionName: `Revoke roles for ${name}`,
          estimatedGasCost: 0.0001,
          onStart: () =>
            revokeRoles({
              name,
              account,
              roles: toRevoke,
              id: REVOKE_ROLES_TX_ID,
            }),
          onDone: handleDone,
        })
      }

      return txList
    }

    if (pendingRemove) {
      const { account, roles } = pendingRemove
      return [
        {
          id: REVOKE_ROLES_TX_ID,
          title: 'Remove user',
          transactionName: `Remove user from ${name}`,
          estimatedGasCost: 0.0001,
          onStart: () =>
            revokeRoles({
              name,
              account,
              roles,
              id: REVOKE_ROLES_TX_ID,
            }),
          onDone: handleDone,
        },
      ]
    }

    return []
  }, [pendingSave, pendingRemove, name, grantRoles, revokeRoles, handleDone])

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen} defaultOpen={false}>
        {children}
        <SheetContent
          side={isMobile ? 'bottom' : 'right'}
          className="sm:max-w-[880px] bg-white overflow-y-auto"
        >
          <div className="p-6 flex flex-col gap-6 h-screen">
            <SheetHeader className="p-0 mt-3">
              <div className="flex flex-wrap justify-between items-center gap-4">
                <SheetTitle className="font-sans text-heading font-medium">
                  Role Details
                </SheetTitle>
                {canManageRoles && selectedAccount && (
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      className="text-lapis-500"
                      disabled={!hasChanges || !isWalletConnected}
                      onClick={handleSaveChanges}
                    >
                      <Save className="size-4" />
                      Save changes
                    </Button>
                    <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                      <DialogTrigger asChild>
                        <Button
                          variant="secondary"
                          className="text-lapis-500"
                          disabled={!isWalletConnected}
                        >
                          <Trash2 className="size-4" />
                          Remove user
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Remove user</DialogTitle>
                          <DialogDescription>
                            Are you sure you want to remove this user from all
                            roles? This action cannot be undone.
                          </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                          <DialogClose asChild>
                            <Button variant="outline">Cancel</Button>
                          </DialogClose>
                          <Button
                            variant="destructive"
                            onClick={handleRemoveUser}
                          >
                            Remove
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                )}
              </div>
            </SheetHeader>

            {row ? (
              <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-2">
                  {selectedAccount && (
                    <CopyableRecord
                      value={selectedAccount}
                      displayValue={
                        <span className="text-xl">{selectedAccount}</span>
                      }
                    />
                  )}
                </div>
                <div className="flex flex-col gap-4">
                  <h3 className="text-lg font-medium">Roles</h3>
                  <div className="border rounded-lg divide-y">
                    {permissions.map((permission) => {
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
                            'flex items-center justify-between p-4 gap-4',
                            isManagerRoleDisabled && 'text-quartz-500',
                          )}
                        >
                          <div className="flex flex-col gap-1 flex-1">
                            <div className="font-medium">
                              {permission.title}
                            </div>
                            <div className="text-sm text-quartz-500">
                              {permission.description}
                            </div>
                          </div>
                          <div className="flex items-center gap-8">
                            <div className="flex items-center gap-2">
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
                              />
                              <Label
                                htmlFor={`${permission.key}-manager`}
                                className={`font-normal cursor-pointer ${
                                  canManageRoles
                                    ? 'text-quartz-500'
                                    : 'text-quartz-400'
                                }`}
                              >
                                Manager
                              </Label>
                            </div>
                            <div className="flex items-center gap-2">
                              <Checkbox
                                id={`${permission.key}-admin`}
                                checked={rolePerms.admin}
                                disabled
                              />
                              <Label
                                htmlFor={`${permission.key}-admin`}
                                className={`font-normal cursor-pointer ${
                                  canManageRoles
                                    ? 'text-quartz-500'
                                    : 'text-quartz-400'
                                }`}
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
              <div className="text-quartz-400 text-center py-12">
                No role selected
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {transactions.length > 0 && (
        <TransactionModal transactions={transactions} />
      )}
    </>
  )
}
