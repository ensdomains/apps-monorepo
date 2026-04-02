import type { ResolverRole } from '@ensdomains/ensjs/public/v2'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Row } from '@tanstack/react-table'
import { Save, Trash2 } from 'lucide-react'
import { type PropsWithChildren, useMemo, useState } from 'react'
import type { Address } from 'viem'
import { useWalletClient } from 'wagmi'
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
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { grantResolverRoles } from '@/features/resolver/helpers/grantResolverRoles'
import { revokeResolverRoles } from '@/features/resolver/helpers/revokeResolverRoles'
import { useResetMutationsOnAccountChange } from '@/features/roles/hooks/useResetMutationsOnAccountChange'
import { useIsMobile } from '@/hooks/use-mobile'
import type { AccountRoleGroup } from '@/lib/roles/resolverRoles'
import {
  type ResolverRoleKey,
  resolverPermissions,
} from '@/lib/roles/resolverRoles'
import {
  computeRoleChanges,
  hasPermissionsChanged,
  type Permission,
  roleToPermissions,
} from '@/lib/roles/rolesToPermissions'
import { cn } from '@/lib/utils'
import { namechainSepolia } from '@/lib/wagmi'
import { pollForIndexerSync } from '@/utils/query/pollForIndexerSync'

type ResolverRolesSidebarProps = PropsWithChildren<{
  readonly row: Row<AccountRoleGroup> | null
  readonly open: boolean
  readonly setOpen: React.Dispatch<React.SetStateAction<boolean>>
  readonly resolverAddress: Address
  readonly canManageRoles: boolean
}>

export const ResolverRolesSidebar = ({
  children,
  row,
  open,
  setOpen,
  resolverAddress,
  canManageRoles,
}: ResolverRolesSidebarProps) => {
  const isMobile = useIsMobile()
  const queryClient = useQueryClient()
  const chainId = namechainSepolia.id
  const [confirmOpen, setConfirmOpen] = useState(false)

  const { data: walletClient } = useWalletClient({ chainId })

  const selectedAccount = row?.original.account
  const decodedRoles = row?.original.decodedRoles ?? []
  const resolvedNames = row?.original.resolvedNames ?? []
  const roleName = resolvedNames.find((n) => n !== '(root)') ?? ''
  const originalPermissions = useMemo(
    () => roleToPermissions(decodedRoles),
    [decodedRoles],
  )

  const [editedPermissions, setEditedPermissions] = useState<
    Map<string, Permission>
  >(new Map())

  // Sync edited permissions when the selected row changes
  const [prevRowId, setPrevRowId] = useState<string | null>(null)
  if (row && row.id !== prevRowId) {
    setPrevRowId(row.id)
    setEditedPermissions(roleToPermissions(row.original.decodedRoles))
  }

  const hasChanges = hasPermissionsChanged(
    originalPermissions,
    editedPermissions,
  )
  const { rolesToGrant, rolesToRevoke } = computeRoleChanges(
    decodedRoles as string[],
    editedPermissions,
  )

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!walletClient?.account) {
        throw new Error('Wallet not connected')
      }
      if (!selectedAccount) {
        throw new Error('No account selected')
      }

      if (rolesToGrant.length > 0) {
        await grantResolverRoles({
          resolverAddress,
          name: roleName,
          account: selectedAccount as Address,
          roles: rolesToGrant as ResolverRole[],
          walletClient,
        })
      }

      if (rolesToRevoke.length > 0) {
        await revokeResolverRoles({
          resolverAddress,
          name: roleName,
          account: selectedAccount as Address,
          roles: rolesToRevoke as ResolverRoleKey[],
          walletClient,
        })
      }
    },
    onSuccess: async () => {
      setOpen(false)
      await pollForIndexerSync({
        invalidateQueries: () =>
          queryClient.invalidateQueries({
            queryKey: ['resolver-overview'],
            refetchType: 'all',
          }),
      })
    },
  })

  const removeUserMutation = useMutation({
    mutationFn: async ({
      name,
      account,
      roles,
    }: {
      readonly name: string
      readonly account: Address
      readonly roles: readonly ResolverRoleKey[]
    }) => {
      if (!walletClient?.account) {
        throw new Error('Wallet not connected')
      }

      return revokeResolverRoles({
        resolverAddress,
        name,
        account,
        roles,
        walletClient,
      })
    },
    onSuccess: async () => {
      setOpen(false)
      await pollForIndexerSync({
        invalidateQueries: () =>
          queryClient.invalidateQueries({
            queryKey: ['resolver-overview'],
            refetchType: 'all',
          }),
      })
    },
  })

  useResetMutationsOnAccountChange(
    selectedAccount,
    saveMutation,
    removeUserMutation,
  )

  const handleSaveChanges = () => {
    if (!selectedAccount || saveMutation.isPending) return
    saveMutation.mutate()
  }

  const handleRemoveUser = () => {
    if (
      !selectedAccount ||
      decodedRoles.length === 0 ||
      removeUserMutation.isPending
    )
      return

    removeUserMutation.reset()
    removeUserMutation.mutate({
      name: roleName,
      account: selectedAccount as Address,
      roles: decodedRoles as ResolverRoleKey[],
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

  const isWalletConnected = Boolean(walletClient?.account)

  return (
    <Sheet open={open} onOpenChange={setOpen} defaultOpen={false}>
      {children}
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className="sm:max-w-[880px] bg-card overflow-y-auto p-8"
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
                    className="text-primary"
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
                  <Button
                    variant="secondary"
                    className="text-primary"
                    disabled={
                      removeUserMutation.isPending || !isWalletConnected
                    }
                    onClick={() => setConfirmOpen(true)}
                  >
                    <Trash2 className="size-4" />
                    Remove user
                  </Button>
                </div>
              )}
            </div>
          </SheetHeader>

          {row ? (
            <div className="flex flex-col gap-6">
              {selectedAccount && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-1">
                    <h2 className="text-xl font-medium leading-snug break-all">
                      {selectedAccount}
                    </h2>
                    <CopyButton value={selectedAccount} />
                  </div>
                  {resolvedNames.length > 0 && (
                    <p className="text-sm text-muted-foreground">
                      {resolvedNames.includes('(root)')
                        ? 'Global roles (all names)'
                        : `Roles scoped to ${resolvedNames.filter((n) => n !== '(root)').join(', ')}`}
                    </p>
                  )}
                </div>
              )}

              {(saveMutation.error || removeUserMutation.error) && (
                <Alert variant="destructive">
                  <AlertDescription>
                    {saveMutation.error?.message ||
                      removeUserMutation.error?.message}
                  </AlertDescription>
                </Alert>
              )}

              <div className="border border-border rounded-2xl overflow-hidden">
                {resolverPermissions.map((permission, index) => {
                  const roleKey = permission.key
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
                      )}
                    >
                      <div className="flex flex-col gap-1 flex-1 min-w-64">
                        <div className="font-medium">{permission.title}</div>
                        <div className="text-sm text-muted-foreground">
                          {permission.description}
                        </div>
                      </div>
                      <div className="flex items-center gap-4 flex-1 min-w-64 justify-end">
                        <div className="flex items-center gap-2 min-w-24">
                          <Checkbox
                            id={`${permission.key}-manager`}
                            checked={rolePerms.manager}
                            disabled={!canManageRoles || saveMutation.isPending}
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
                                ? 'text-foreground'
                                : 'text-muted-foreground',
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
                                ? 'text-foreground'
                                : 'text-muted-foreground',
                            )}
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
          ) : (
            <div className="text-muted-foreground text-center py-12">
              No role selected
            </div>
          )}
        </div>

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
