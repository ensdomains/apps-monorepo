import type { Role } from '@ensdomains/ensjs/utils/v2'
import { useQuery } from '@tanstack/react-query'
import { type FormEvent, useEffect, useState } from 'react'
import { match } from 'ts-pattern'
import type { Address } from 'viem'
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
import { useGrantRegistryRolesMutation } from '@/features/registry/hooks/useGrantRegistryRoles'
import { useResolvedRoleAccountAddress } from '@/features/roles/hooks/useResolvedRoleAccountAddress'
import { TransactionModal } from '@/features/transaction-manager/components/TransactionModal'
import { useTransactionModal } from '@/features/transaction-manager/hooks/useTransactionModal'
import { registryRootPermissions } from '@/lib/roles/permissions'
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
  // Controlled selection so the Save button can disable until at least one
  // checkbox is checked (matches the design's gray/disabled Save state).
  const [selectedRoles, setSelectedRoles] = useState<Set<Role>>(new Set())
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
  const { grantRegistryRoles, isPending, isSuccess, reset } =
    useGrantRegistryRolesMutation()

  // Reset form state AND the underlying mutation when the sheet closes —
  // otherwise `isSuccess` sticks across re-opens, leaving the input disabled
  // and Save permanently gated.
  useEffect(() => {
    if (open) return
    setNameOrAddressInput('')
    setSelectedRoles(new Set())
    setPendingGrant(null)
    setSubmitFeedback(null)
    setInvalidField(null)
    reset()
  }, [open, reset])

  const toggleRole = (role: Role, checked: boolean) => {
    setSelectedRoles((prev) => {
      const next = new Set(prev)
      if (checked) next.add(role)
      else next.delete(role)
      return next
    })
    setSubmitFeedback(null)
    setInvalidField(null)
  }

  const canSave = !!address && selectedRoles.size > 0 && !isSuccess

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setSubmitFeedback(null)
    setInvalidField(null)

    const roles = Array.from(selectedRoles)
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
        className="sm:max-w-3xl bg-background overflow-y-auto p-0"
      >
        <div className="p-6 flex flex-col gap-6 h-full">
          <SheetHeader className="p-0">
            <SheetTitle className="font-sans text-heading font-medium">
              Add user
            </SheetTitle>
          </SheetHeader>

          <form onSubmit={handleSubmit} className="flex flex-col gap-6 flex-1">
            <Field data-invalid={invalidField === 'address'}>
              <Input
                id="user"
                name="user"
                placeholder="User name or address"
                required
                disabled={isPending || isSuccess}
                aria-invalid={invalidField === 'address'}
                onChange={(e) => {
                  setNameOrAddressInput(e.currentTarget.value.trim())
                  setSubmitFeedback(null)
                  setInvalidField(null)
                }}
                className="h-12 bg-background border"
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
              <div
                className={cn('border-t divide-y transition-colors', {
                  'opacity-50 pointer-events-none': isPending || isSuccess,
                })}
                aria-invalid={invalidField === 'roles'}
              >
                {registryRootPermissions.map((permission) => {
                  const callerLacksAdmin = !callerAdminRoles.has(
                    permission.adminKey,
                  )
                  const userKey = permission.key
                  const adminKey = permission.adminKey

                  return (
                    <div
                      key={permission.adminKey}
                      className={cn(
                        'flex items-center justify-between p-4 gap-4',
                        callerLacksAdmin && 'text-muted-foreground',
                      )}
                      title={
                        callerLacksAdmin
                          ? `Your account does not hold ${permission.adminKey} on this registry and cannot grant this role.`
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
                        {/* Admin column (left) */}
                        <div className="flex items-center gap-2 w-24">
                          <Checkbox
                            id={adminKey}
                            checked={selectedRoles.has(adminKey)}
                            onCheckedChange={(c) =>
                              toggleRole(adminKey, c === true)
                            }
                            disabled={callerLacksAdmin}
                          />
                          <Label
                            htmlFor={adminKey}
                            className="font-normal cursor-pointer text-muted-foreground"
                          >
                            Admin
                          </Label>
                        </div>
                        {/* User column (right) — admin-only rows render a dash. */}
                        <div className="flex items-center gap-2 w-24">
                          {userKey ? (
                            <>
                              <Checkbox
                                id={userKey}
                                checked={selectedRoles.has(userKey as Role)}
                                onCheckedChange={(c) =>
                                  toggleRole(userKey as Role, c === true)
                                }
                                disabled={callerLacksAdmin}
                              />
                              <Label
                                htmlFor={userKey}
                                className="font-normal cursor-pointer text-muted-foreground"
                              >
                                User
                              </Label>
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">
                              —
                            </span>
                          )}
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
