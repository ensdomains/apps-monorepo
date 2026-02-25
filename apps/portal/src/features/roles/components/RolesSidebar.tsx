import type { Role } from '@ensdomains/ensjs/utils/v2'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Row } from '@tanstack/react-table'
import { Trash2 } from 'lucide-react'
import { type PropsWithChildren, useEffect, useState } from 'react'
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
import { pollForIndexerSync } from '@/features/records/helpers/pollForIndexerSync'
import { createEOASigner } from '@/features/registry/utils/signer.helpers'
import { revokeRoles } from '@/features/roles/helpers/revokeRoles'
import { useIsMobile } from '@/hooks/use-mobile'
import { permissions } from '@/lib/roles/permissions'
import { roleToPermissions } from '@/lib/roles/rolesToPermissions'
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
  const queryClient = useQueryClient()
  const chainId = namechainSepolia.id
  const [confirmOpen, setConfirmOpen] = useState(false)

  const { data: walletClient } = useWalletClient({ chainId })
  const publicClient = usePublicClient({ chainId })

  const selectedAccount = row?.original.account
  const selectedRoles = (row?.original.items ?? []) as Role[]

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
      await pollForIndexerSync({
        invalidateQueries: () =>
          queryClient.invalidateQueries({
            predicate: (query) =>
              query.queryKey[0] === 'get-name-roles-accounts' ||
              query.queryKey[0] === 'getNameRolesForAccount',
            refetchType: 'all',
          }),
      })
      setOpen(false)
    },
  })

  useEffect(() => {
    if (selectedAccount && !removeUserMutation.isPending) {
      removeUserMutation.reset()
    }
  }, [removeUserMutation.isPending, removeUserMutation.reset, selectedAccount])

  const handleRemoveUser = () => {
    if (
      !selectedAccount ||
      selectedRoles.length === 0 ||
      removeUserMutation.isPending
    ) {
      return
    }

    removeUserMutation.reset()
    removeUserMutation.mutate({
      account: selectedAccount,
      roles: selectedRoles,
    })
  }

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
              <SheetTitle className="font-sans text-[28px] font-medium">
                Role Details
              </SheetTitle>
              {canManageRoles && selectedAccount && (
                <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                  <DialogTrigger asChild>
                    <Button
                      variant="secondary"
                      className="text-lapis-500"
                      disabled={
                        removeUserMutation.isPending ||
                        !walletClient?.account ||
                        !publicClient
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
              {removeUserMutation.error && (
                <Alert variant="destructive">
                  <AlertDescription>
                    {removeUserMutation.error.message}
                  </AlertDescription>
                </Alert>
              )}

              {/* Roles Section */}
              <div className="flex flex-col gap-4">
                <h3 className="text-lg font-medium">Roles</h3>
                <div className="border rounded-lg divide-y">
                  {(() => {
                    // Get permissions from row data
                    const rolePermissionsMap = roleToPermissions(
                      row.original.items,
                    )

                    return permissions.map((permission) => {
                      // Look up permissions using the permission key directly
                      // The key matches the format in the items array (e.g., 'SET_SUBREGISTRY')
                      const rolePermissions = rolePermissionsMap.get(
                        permission.key.slice(5), // strip ROLE_
                      ) || {
                        admin: false,
                        manager: false,
                      }

                      return (
                        <div
                          key={permission.key}
                          className="flex items-center justify-between p-4 gap-4"
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
                                checked={rolePermissions.manager}
                                disabled
                              />
                              <Label
                                htmlFor={`${permission.key}-manager`}
                                className="font-normal cursor-pointer text-quartz-500"
                              >
                                Manager
                              </Label>
                            </div>
                            <div className="flex items-center gap-2">
                              <Checkbox
                                id={`${permission.key}-admin`}
                                checked={rolePermissions.admin}
                                disabled
                              />
                              <Label
                                htmlFor={`${permission.key}-admin`}
                                className="font-normal cursor-pointer text-quartz-500"
                              >
                                Admin
                              </Label>
                            </div>
                          </div>
                        </div>
                      )
                    })
                  })()}
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
