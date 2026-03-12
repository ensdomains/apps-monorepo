import type { Role } from '@ensdomains/ensjs/utils/v2'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Row } from '@tanstack/react-table'
import { CheckCircle, Clock, Save, Trash2 } from 'lucide-react'
import { type PropsWithChildren, useMemo, useState } from 'react'
import type { Address } from 'viem'
import { usePublicClient, useWalletClient } from 'wagmi'
import { CopyButton } from '@/components/CopyButton'
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
import { RoleHistoryTable } from '@/features/roles/components/RoleHistoryTable'
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

  return (
    <Sheet open={open} onOpenChange={setOpen} defaultOpen={false}>
      {children}
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className="sm:max-w-[880px] bg-white overflow-y-auto p-8"
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
              {/* Header */}
              <div className="flex flex-wrap justify-between items-center gap-4">
                <div className="flex items-center gap-1">
                  <h2 className="text-4xl font-medium leading-snug">{name}</h2>
                  <CopyButton value={name} />
                </div>
                {canManageRoles && selectedAccount && (
                  <Button
                    variant="secondary"
                    className="bg-lapis-100 text-lapis-500 hover:bg-lapis-100/80 gap-2"
                    disabled={
                      removeUserMutation.isPending || !isWalletConnected
                    }
                    onClick={() => setConfirmOpen(true)}
                  >
                    <Trash2 className="size-5" />
                    Remove user
                  </Button>
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
                            className="data-[state=checked]:bg-citrine-500 data-[state=checked]:border-citrine-500"
                          />
                          <Label
                            htmlFor={`${permission.key}-manager`}
                            className={cn(
                              'font-medium cursor-pointer',
                              canManageRoles ? 'text-black' : 'text-quartz-400',
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
                              canManageRoles ? 'text-black' : 'text-quartz-400',
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
                    className="gap-2 text-quartz-400 bg-quartz-50 hover:bg-quartz-50/80"
                    disabled={
                      !hasChanges ||
                      saveMutation.isPending ||
                      !isWalletConnected
                    }
                    onClick={handleSaveChanges}
                  >
                    <CheckCircle className="size-5" />
                    {saveMutation.isPending ? 'Saving...' : 'Save changes'}
                  </Button>
                </div>
              </div>

              {/* History Section */}
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap justify-between items-center gap-4">
                  <h3 className="text-2xl font-medium leading-snug">History</h3>
                  <Button
                    variant="secondary"
                    className="bg-lapis-100 text-lapis-500 hover:bg-lapis-100/80 gap-1 h-8 px-2 py-1 text-sm"
                  >
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
                disabled={removeUserMutation.isPending}
              >
                {removeUserMutation.isPending ? 'Removing...' : 'Remove'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>
  )
}
