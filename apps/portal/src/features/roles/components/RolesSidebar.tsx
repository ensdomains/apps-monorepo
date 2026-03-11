import type { Role } from '@ensdomains/ensjs/utils/v2'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Row } from '@tanstack/react-table'
import { Save, Trash2 } from 'lucide-react'
import { type PropsWithChildren, useMemo, useState } from 'react'
import type { Address } from 'viem'
import { usePublicClient, useWalletClient } from 'wagmi'
import { CopyableRecord } from '@/components/CopyableRecord'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
import { createEOASigner } from '@/features/registry/utils/signer.helpers'
import { grantRoles } from '@/features/roles/helpers/grantRoles'
import { revokeRoles } from '@/features/roles/helpers/revokeRoles'
import { useEditedPermissions } from '@/features/roles/hooks/useEditedPermissions'
import { useResetMutationsOnAccountChange } from '@/features/roles/hooks/useResetMutationsOnAccountChange'
import { useIsMobile } from '@/hooks/use-mobile'
import { isManagerRoleSettable, permissions } from '@/lib/roles/permissions'
import {
  computeRoleChanges,
  hasPermissionsChanged,
  roleToPermissions,
} from '@/lib/roles/rolesToPermissions'
import { cn } from '@/lib/utils'
import { namechainSepolia } from '@/lib/wagmi'
import { pollForIndexerSync } from '@/utils/query/pollForIndexerSync'

type RolesSidebarProps<TData extends { items: string[]; account: Address }> =
  PropsWithChildren<{
    row: Row<TData> | null
    open: boolean
    setOpen: React.Dispatch<React.SetStateAction<boolean>>
    name: string
    canManageRoles: boolean
    owner?: Address
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
  owner,
}: RolesSidebarProps<TData>) => {
  const isMobile = useIsMobile()
  const queryClient = useQueryClient()
  const chainId = namechainSepolia.id
  const [confirmOpen, setConfirmOpen] = useState(false)

  const { data: walletClient } = useWalletClient({ chainId })
  const publicClient = usePublicClient({ chainId })

  const selectedAccount = row?.original.account
  const originalRoles = useMemo(
    () => (row?.original.items ?? []) as Role[],
    [row],
  )

  // Custom hook for managing edited permissions state
  const { editedPermissions, setEditedPermissions } = useEditedPermissions(row)

  const hasChanges = hasPermissionsChanged(
    roleToPermissions(originalRoles),
    editedPermissions,
  )
  const { rolesToGrant, rolesToRevoke } = computeRoleChanges(
    originalRoles,
    editedPermissions,
  )

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!walletClient?.account || !publicClient) {
        throw new Error('Wallet not connected')
      }

      if (!selectedAccount) {
        throw new Error('No account selected')
      }

      const signer = createEOASigner(walletClient)

      // Grant new roles
      if (rolesToGrant.length > 0) {
        await grantRoles({
          name,
          account: selectedAccount,
          roles: rolesToGrant as Role[],
          walletClient,
          publicClient,
          signer,
          chainId,
        })
      }

      // Revoke removed roles
      if (rolesToRevoke.length > 0) {
        await revokeRoles({
          name,
          account: selectedAccount,
          roles: rolesToRevoke as Role[],
          walletClient,
          publicClient,
          signer,
          chainId,
        })
      }
    },
    onSuccess: async () => {
      setOpen(false)
      await pollForIndexerSync({
        invalidateQueries: () =>
          queryClient.invalidateQueries({
            predicate: (query) =>
              query.queryKey[0] === 'get-name-roles-accounts' ||
              query.queryKey[0] === 'getNameRolesForAccount',
            refetchType: 'all',
          }),
      })
    },
  })

  const removeUserMutation = useMutation({
    mutationFn: async ({
      account,
      roles,
    }: {
      account: Address
      roles: Role[]
    }) => {
      if (!walletClient?.account || !publicClient) {
        throw new Error('Wallet not connected')
      }

      return revokeRoles({
        name,
        account,
        roles,
        walletClient,
        publicClient,
        signer: createEOASigner(walletClient),
        chainId,
      })
    },
    onSuccess: async () => {
      setOpen(false)
      await pollForIndexerSync({
        invalidateQueries: () =>
          queryClient.invalidateQueries({
            predicate: (query) =>
              query.queryKey[0] === 'get-name-roles-accounts' ||
              query.queryKey[0] === 'getNameRolesForAccount',
            refetchType: 'all',
          }),
      })
    },
  })

  // Reset mutations when account changes and mutations are not pending
  useResetMutationsOnAccountChange(
    selectedAccount,
    saveMutation,
    removeUserMutation,
  )

  const handleSaveChanges = () => {
    if (!selectedAccount || saveMutation.isPending) {
      return
    }

    saveMutation.mutate()
  }

  const handleRemoveUser = () => {
    if (
      !selectedAccount ||
      originalRoles.length === 0 ||
      removeUserMutation.isPending
    ) {
      return
    }

    removeUserMutation.reset()
    removeUserMutation.mutate({
      account: selectedAccount,
      roles: originalRoles,
    })
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

  const isWalletConnected = walletClient?.account && publicClient

  const isRemovingOwner =
    selectedAccount &&
    owner &&
    selectedAccount.toLowerCase() === owner.toLowerCase()
  const isRemovingSelf =
    selectedAccount &&
    walletClient?.account?.address &&
    selectedAccount.toLowerCase() === walletClient.account.address.toLowerCase()

  return (
    <Sheet open={open} onOpenChange={setOpen} defaultOpen={false}>
      {children}
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className="sm:max-w-[880px] bg-white overflow-y-auto"
      >
        <div className="p-6 flex flex-col gap-6 h-screen">
          <SheetHeader className="p-0">
            <div className="flex flex-wrap justify-between items-center gap-4">
              <SheetTitle className="font-sans text-heading font-medium">
                Role Details
              </SheetTitle>
              {canManageRoles && selectedAccount && (
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    className="text-lapis-500"
                    disabled={
                      !hasChanges ||
                      saveMutation.isPending ||
                      !isWalletConnected
                    }
                    onClick={handleSaveChanges}
                  >
                    <Save className="size-4" />
                    {saveMutation.isPending ? 'Saving...' : 'Save changes'}
                  </Button>
                  <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                    <DialogTrigger asChild>
                      <Button
                        variant="secondary"
                        className="text-lapis-500"
                        disabled={
                          removeUserMutation.isPending || !isWalletConnected
                        }
                      >
                        <Trash2 className="size-4" />
                        Remove user
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Remove user</DialogTitle>
                        <DialogDescription className="flex flex-col gap-2">
                          <span>
                            Are you sure you want to remove this user from all
                            roles? This action cannot be undone.
                          </span>
                          {isRemovingOwner && (
                            <span className="text-amber-600 font-medium">
                              Warning: You are about to remove the owner of this
                              name. The owner will lose all administrative
                              privileges.
                            </span>
                          )}
                          {isRemovingSelf && (
                            <span className="text-amber-600 font-medium">
                              Warning: You are about to remove yourself. You
                              will lose all roles for this name.
                            </span>
                          )}
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
                          disabled={removeUserMutation.isPending}
                        >
                          {removeUserMutation.isPending
                            ? 'Removing...'
                            : 'Remove'}
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
              {/* Account Address Section */}
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
              {(saveMutation.error || removeUserMutation.error) && (
                <Alert variant="destructive">
                  <AlertDescription>
                    {saveMutation.error?.message ||
                      removeUserMutation.error?.message}
                  </AlertDescription>
                </Alert>
              )}

              {/* Roles Section */}
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
                          <div className="font-medium">{permission.title}</div>
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
                                !canManageRoles ||
                                saveMutation.isPending ||
                                isManagerRoleDisabled
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
  )
}
