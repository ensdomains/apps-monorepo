import type { Role } from '@ensdomains/ensjs/utils/v2'
import { useQuery } from '@tanstack/react-query'
import { type FormEvent, useEffect, useState } from 'react'
import { match } from 'ts-pattern'
import { type Address, zeroAddress } from 'viem'
import { useWalletClient } from 'wagmi'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldError } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useGrantRoles } from '@/features/roles/hooks/useGrantRoles'
import { getNameRolesForAccountQueryOptions } from '@/features/roles/hooks/useNameRolesForAccount'
import { useResolvedRoleAccountAddress } from '@/features/roles/hooks/useResolvedRoleAccountAddress'
import { TransactionModal } from '@/features/transaction-manager/components/TransactionModal'
import { useTransactionModal } from '@/features/transaction-manager/hooks/useTransactionModal'
import { isManagerRoleSettable, permissions } from '@/lib/roles/permissions'
import { cn } from '@/lib/utils'
import { wagmiConfig } from '@/lib/wagmi'
import { truncateAddress } from '@/utils/formatting/truncateAddress'

const GRANT_ROLES_TX_ID = 'tx-grant-roles'
// Module-level client for the resolver hook — matches the original add-user
// form which used the wagmi config client outside any hook.
const client = wagmiConfig.getClient()

type RolesAddUserSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  name: string
  registryAddress: Address
}

export const RolesAddUserSheet = ({
  open,
  onOpenChange,
  name,
  registryAddress,
}: RolesAddUserSheetProps) => {
  const { data: walletClient } = useWalletClient()
  const callerAddress = walletClient?.account?.address

  const labels = name.split('.')
  const is2LD = labels.length === 2

  // The caller can only grant a role they hold the `_ADMIN` variant of.
  const { data: callerRolesData } = useQuery({
    ...getNameRolesForAccountQueryOptions({
      registryAddress,
      label: labels[0],
      account: callerAddress ?? zeroAddress,
    }),
    enabled: Boolean(callerAddress),
  })

  const callerAdminRoles = new Set<Role>(
    (callerRolesData?.decoded ?? []).filter((r): r is Role =>
      r.endsWith('_ADMIN'),
    ),
  )

  const [nameOrAddressInput, setNameOrAddressInput] = useState('')
  // Controlled selection so the Save button can disable until a role is picked.
  const [selectedRoles, setSelectedRoles] = useState<Set<Role>>(new Set())
  const [pendingGrant, setPendingGrant] = useState<{
    account: Address
    roles: Role[]
  } | null>(null)
  const [formError, setFormError] = useState<{
    field: 'roles' | 'address'
    message: string
  } | null>(null)

  const {
    data: address,
    isFetching: isResolvingAddress,
    isError: isResolveError,
    error: resolveError,
  } = useResolvedRoleAccountAddress({
    client,
    nameOrAddress: nameOrAddressInput,
  })

  const { openModal, closeModal, clearTransaction } = useTransactionModal()
  const { grantRoles, isPending, isSuccess, reset } = useGrantRoles()

  // Reset form + mutation when the sheet closes, otherwise `isSuccess` sticks
  // across re-opens and leaves the input disabled / Save permanently gated.
  useEffect(() => {
    if (open) return
    setNameOrAddressInput('')
    setSelectedRoles(new Set())
    setPendingGrant(null)
    setFormError(null)
    reset()
  }, [open, reset])

  const toggleRole = (role: Role, checked: boolean) => {
    setSelectedRoles((prev) => {
      const next = new Set(prev)
      if (checked) next.add(role)
      else next.delete(role)
      return next
    })
    setFormError(null)
  }

  const canSave =
    !!address &&
    !isResolvingAddress &&
    !isResolveError &&
    selectedRoles.size > 0 &&
    !isSuccess

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setFormError(null)

    const roles = Array.from(selectedRoles)
    if (roles.length === 0) {
      setFormError({
        field: 'roles',
        message: 'Please select at least one role',
      })
      return
    }
    if (isResolvingAddress) {
      setFormError({
        field: 'address',
        message: 'Resolving address... Please wait a moment and try again.',
      })
      return
    }
    if (isResolveError || !address) {
      setFormError({
        field: 'address',
        message: `Could not resolve an address for "${nameOrAddressInput}". ${resolveError ? `Error: ${resolveError instanceof Error ? resolveError.message : String(resolveError)}` : 'Check the name exists and try again.'}`,
      })
      return
    }

    setPendingGrant({ account: address, roles })
    openModal()
  }

  const handleStartTransaction = () => {
    if (!pendingGrant || !walletClient?.account) return
    grantRoles({
      name,
      account: pendingGrant.account,
      roles: pendingGrant.roles,
      id: GRANT_ROLES_TX_ID,
      registryAddress,
    })
  }

  const handleDone = () => {
    closeModal()
    clearTransaction()
    setPendingGrant(null)
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="sm:max-w-3xl bg-background overflow-y-auto p-0"
      >
        <div className="p-6 flex flex-col gap-6 h-full">
          <SheetHeader className="p-0 pt-4">
            <SheetTitle className="font-sans text-heading font-medium">
              Add user
            </SheetTitle>
          </SheetHeader>

          <form onSubmit={handleSubmit} className="flex flex-col gap-6 flex-1">
            <Field data-invalid={formError?.field === 'address'}>
              <Input
                id="user"
                name="user"
                placeholder="User name or address"
                required
                disabled={isPending || isSuccess}
                aria-invalid={formError?.field === 'address'}
                onChange={(e) => {
                  setNameOrAddressInput(e.currentTarget.value.trim())
                  setFormError(null)
                }}
                className="h-12 bg-background border"
              />
              {nameOrAddressInput.length > 0 && (
                <p className="text-sm mt-1.5 text-muted-foreground">
                  {isResolvingAddress && 'Resolving address...'}
                  {!isResolvingAddress &&
                    address &&
                    `Resolved: ${truncateAddress(address, 6, 4)}`}
                  {!isResolvingAddress &&
                    !address &&
                    'Could not resolve address. Check the name exists.'}
                </p>
              )}
            </Field>

            <Field data-invalid={formError?.field === 'roles'}>
              <div
                className={cn(
                  'border border-border rounded-sm overflow-hidden transition-colors',
                  (isPending || isSuccess) && 'opacity-50 pointer-events-none',
                )}
                aria-invalid={formError?.field === 'roles'}
              >
                {permissions.map((permission, index) => {
                  const managerRole = permission.key as Role
                  const adminRole = `${permission.key}_ADMIN` as Role
                  const callerLacksAdmin = !callerAdminRoles.has(adminRole)
                  const isManagerRoleDisabled =
                    !isManagerRoleSettable(permission.key, { is2LD }) ||
                    callerLacksAdmin

                  return (
                    <div
                      key={permission.key}
                      className={cn(
                        'flex items-center justify-between px-6 py-4 gap-4',
                        index !== 0 && 'border-t border-border',
                        isManagerRoleDisabled && 'text-muted-foreground',
                      )}
                      title={
                        callerLacksAdmin
                          ? `Your account does not hold ${adminRole} on this name and cannot grant this role.`
                          : undefined
                      }
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
                            id={`add-${permission.key}-manager`}
                            checked={selectedRoles.has(managerRole)}
                            disabled={isManagerRoleDisabled}
                            onCheckedChange={(checked) =>
                              toggleRole(managerRole, checked as boolean)
                            }
                          />
                          <Label
                            htmlFor={`add-${permission.key}-manager`}
                            className="font-medium cursor-pointer"
                          >
                            Manager
                          </Label>
                        </div>
                        <div className="flex items-center gap-2 min-w-24">
                          <Checkbox
                            id={`add-${permission.key}-admin`}
                            checked={selectedRoles.has(adminRole)}
                            disabled
                          />
                          <Label
                            htmlFor={`add-${permission.key}-admin`}
                            className="font-medium cursor-pointer"
                          >
                            Admin
                          </Label>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              {formError && (
                <FieldError className="mt-1.5">{formError.message}</FieldError>
              )}
            </Field>

            <div className="flex justify-end">
              <Button type="submit" variant="default" disabled={!canSave}>
                {match({ isPending, isSuccess })
                  .with({ isSuccess: true }, () => 'Transaction Complete')
                  .with({ isPending: true }, () => 'Saving...')
                  .otherwise(() => 'Save')}
              </Button>
            </div>
          </form>

          <TransactionModal
            transactions={[
              {
                id: GRANT_ROLES_TX_ID,
                title: 'Grant roles',
                transactionName: `Grant roles for ${name}`,
                estimatedGasCost: 0.0001,
                onStart: handleStartTransaction,
                onDone: handleDone,
              },
            ]}
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}
