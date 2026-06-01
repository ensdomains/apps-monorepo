import type { Role } from '@ensdomains/ensjs/utils/v2'
import { useQuery } from '@tanstack/react-query'
import { type FormEvent, useEffect, useState } from 'react'
import { match } from 'ts-pattern'
import type { Address } from 'viem'
import { useWalletClient } from 'wagmi'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useGrantRegistryRoles } from '@/features/registry/hooks/useGrantRegistryRoles'
import { useResolvedRoleAccountAddress } from '@/features/roles/hooks/useResolvedRoleAccountAddress'
import { TransactionModal } from '@/features/transaction-manager/components/TransactionModal'
import { useTransactionModal } from '@/features/transaction-manager/hooks/useTransactionModal'
import { isManagerRoleSettable, permissions } from '@/lib/roles/permissions'
import { cn } from '@/lib/utils'
import { wagmiConfig } from '@/lib/wagmi'
import { getRegistryRolesQueryOptions } from '../../hooks/useRegistryRoles'

const GRANT_REGISTRY_ROLES_TX_ID = 'tx-grant-registry-roles'
// Module-level client for the resolver hook — matches /$name/roles/add-user.tsx
// which uses the same wagmi config client outside any hook.
const client = wagmiConfig.getClient()

type RegistryAddUserSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  registryAddress: Address
}

export const RegistryAddUserSheet = ({
  open,
  onOpenChange,
  registryAddress,
}: RegistryAddUserSheetProps) => {
  const { data: walletClient } = useWalletClient()
  const callerAddress = walletClient?.account?.address

  // Existing root-resource role holders for this registry. Cache hit when the
  // roles page is already mounted (same query key) — used to figure out which
  // permissions the connected caller has admin rights to grant.
  const { data: rolesData } = useQuery({
    ...getRegistryRolesQueryOptions({ address: registryAddress }),
    enabled: Boolean(callerAddress),
  })

  const callerAdminRoles = new Set<Role>(
    (
      rolesData?.find(
        (row) =>
          callerAddress &&
          row.account.toLowerCase() === callerAddress.toLowerCase(),
      )?.roles ?? []
    ).filter((r): r is Role => r.endsWith('_ADMIN')),
  )

  const [nameOrAddressInput, setNameOrAddressInput] = useState('')
  const [pendingGrant, setPendingGrant] = useState<{
    account: Address
    roles: Role[]
  } | null>(null)
  const [submitFeedback, setSubmitFeedback] = useState<string | null>(null)
  const [invalidField, setInvalidField] = useState<'roles' | 'address' | null>(
    null,
  )

  const {
    data: address,
    isLoading: isResolvingAddress,
    isError: isResolveError,
    error: resolveError,
  } = useResolvedRoleAccountAddress({
    client,
    nameOrAddress: nameOrAddressInput,
  })

  const { openModal, closeModal, clearTransaction } = useTransactionModal()
  const { grantRegistryRoles, isPending, isSuccess } = useGrantRegistryRoles()

  // Reset form-only state when the sheet closes so re-opening starts fresh.
  useEffect(() => {
    if (open) return
    setNameOrAddressInput('')
    setPendingGrant(null)
    setSubmitFeedback(null)
    setInvalidField(null)
  }, [open])

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setSubmitFeedback(null)
    setInvalidField(null)
    if (!e.currentTarget.reportValidity()) return

    const fd = new FormData(e.currentTarget)
    const roles: Role[] = []
    for (const [k, v] of fd.entries()) {
      if (v === 'on') roles.push(k as Role)
    }

    if (roles.length === 0) {
      setSubmitFeedback('Please select at least one role')
      setInvalidField('roles')
      return
    }
    if (isResolvingAddress) {
      setSubmitFeedback(
        'Resolving address... Please wait a moment and try again.',
      )
      setInvalidField('address')
      return
    }
    if (isResolveError || !address) {
      setSubmitFeedback(
        `Could not resolve an address for "${nameOrAddressInput}". ${resolveError ? `Error: ${resolveError instanceof Error ? resolveError.message : String(resolveError)}` : 'Check the name exists and try again.'}`,
      )
      setInvalidField('address')
      return
    }

    setPendingGrant({ account: address, roles })
    openModal()
  }

  const handleStartTransaction = () => {
    if (!pendingGrant || !walletClient?.account) return
    grantRegistryRoles({
      registryAddress,
      account: pendingGrant.account,
      roles: pendingGrant.roles,
      id: GRANT_REGISTRY_ROLES_TX_ID,
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
        className="sm:max-w-[640px] bg-background overflow-y-auto p-0"
      >
        <div className="p-6 flex flex-col gap-6 h-full">
          <SheetHeader className="p-0">
            <SheetTitle className="font-sans text-heading font-medium">
              Add user
            </SheetTitle>
          </SheetHeader>

          <form
            onSubmit={handleSubmit}
            onChange={() => {
              setSubmitFeedback(null)
              setInvalidField(null)
            }}
            className="flex flex-col gap-6"
          >
            <Field data-invalid={invalidField === 'address'}>
              <FieldLabel htmlFor="user">User</FieldLabel>
              <Input
                id="user"
                name="user"
                placeholder="ens.eth or 0x address"
                required
                disabled={isPending || isSuccess}
                aria-invalid={invalidField === 'address'}
                onChange={(e) => {
                  setNameOrAddressInput(e.currentTarget.value.trim())
                }}
              />
              {nameOrAddressInput.length > 0 && (
                <p className="text-sm mt-1.5 text-muted-foreground">
                  {isResolvingAddress && 'Resolving address...'}
                  {!isResolvingAddress &&
                    address &&
                    `Resolved: ${address.slice(0, 6)}...${address.slice(-4)}`}
                  {!isResolvingAddress &&
                    !address &&
                    'Could not resolve address. Check the name exists.'}
                </p>
              )}
            </Field>

            <Field data-invalid={invalidField === 'roles'}>
              <FieldLabel>Roles</FieldLabel>
              <div
                className={cn('border rounded-sm divide-y transition-colors', {
                  'opacity-50 pointer-events-none': isPending || isSuccess,
                })}
                aria-invalid={invalidField === 'roles'}
              >
                {permissions.map((permission) => {
                  const adminKey = `${permission.key}_ADMIN` as Role
                  const callerLacksAdmin = !callerAdminRoles.has(adminKey)
                  // Root-resource grants aren't subject to the 2LD restriction;
                  // gating is purely on the global manager-settable check + the
                  // caller actually holding the matching _ADMIN role.
                  const isManagerRoleDisabled =
                    !isManagerRoleSettable(permission.key) || callerLacksAdmin

                  return (
                    <div
                      key={permission.key}
                      className={cn(
                        'flex items-center justify-between p-4 gap-4',
                        isManagerRoleDisabled && 'text-muted-foreground',
                      )}
                      title={
                        callerLacksAdmin
                          ? `Your account does not hold ${adminKey} on this registry and cannot grant this role.`
                          : undefined
                      }
                    >
                      <div className="flex flex-col gap-1 flex-1">
                        <div className="font-medium">{permission.title}</div>
                        <div className="text-sm text-muted-foreground">
                          {permission.description}
                        </div>
                      </div>
                      <div className="flex items-center gap-8">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            name={permission.key}
                            id={permission.key}
                            disabled={isManagerRoleDisabled}
                          />
                          <Label
                            htmlFor={permission.key}
                            className="font-normal cursor-pointer text-muted-foreground"
                          >
                            Manager
                          </Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Checkbox id={`${permission.key}_ADMIN`} disabled />
                          <Label
                            htmlFor={`${permission.key}_ADMIN`}
                            className="font-normal cursor-pointer text-muted-foreground"
                          >
                            Admin
                          </Label>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              {submitFeedback && (
                <FieldError className="mt-1.5">{submitFeedback}</FieldError>
              )}
            </Field>

            <Button type="submit" variant="default" className="w-fit">
              {match({ isPending, isSuccess })
                .with({ isSuccess: true }, () => 'Transaction Complete')
                .with({ isPending: true }, () => 'Saving...')
                .otherwise(() => 'Save roles')}
            </Button>
          </form>

          <TransactionModal
            transactions={[
              {
                id: GRANT_REGISTRY_ROLES_TX_ID,
                title: 'Grant roles',
                transactionName: 'Grant registry roles',
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
