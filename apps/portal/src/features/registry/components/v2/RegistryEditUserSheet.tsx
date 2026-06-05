import type { Role } from '@ensdomains/ensjs/utils/v2'
import { useQuery } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { match } from 'ts-pattern'
import type { Address } from 'viem'
import { useEnsName, useWalletClient } from 'wagmi'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldError } from '@/components/ui/field'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useGrantRegistryRolesMutation } from '@/features/registry/hooks/useGrantRegistryRoles'
import { useRevokeRegistryRolesMutation } from '@/features/registry/hooks/useRevokeRegistryRoles'
import { TransactionModal } from '@/features/transaction-manager/components/TransactionModal'
import { useTransactionModal } from '@/features/transaction-manager/hooks/useTransactionModal'
import type { Transaction } from '@/features/transaction-manager/types'
import { registryRootPermissions } from '@/lib/roles/permissions'
import { cn } from '@/lib/utils'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import { getRegistryRolesQueryOptions } from '../../hooks/useRegistryRoles'
import { RegistryUserRoleHistory } from './RegistryUserRoleHistory'

const GRANT_TX_ID = 'tx-edit-registry-roles-grant'
const REVOKE_TX_ID = 'tx-edit-registry-roles-revoke'

type RegistryEditUserSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  registryAddress: Address
  /** The user being edited. Null when no row is selected (sheet closed). */
  account: Address | null
  /** The user's currently held roles at the registry root resource. */
  currentRoles: readonly Role[]
}

export const RegistryEditUserSheet = ({
  open,
  onOpenChange,
  registryAddress,
  account,
  currentRoles,
}: RegistryEditUserSheetProps) => {
  const { data: walletClient } = useWalletClient()
  const callerAddress = walletClient?.account?.address

  const { data: primaryName } = useEnsName({
    address: account ?? undefined,
  })
  const titleLabel = account
    ? (primaryName ?? truncateAddress(account, 6, 4))
    : 'Edit user'

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

  const initialRoles = useMemo(
    () => new Set<Role>(currentRoles),
    [currentRoles],
  )

  const [selectedRoles, setSelectedRoles] = useState<Set<Role>>(initialRoles)
  const [pendingTx, setPendingTx] = useState<
    { kind: 'grant'; roles: Role[] } | { kind: 'revoke'; roles: Role[] } | null
  >(null)
  const [queuedRevoke, setQueuedRevoke] = useState<Role[] | null>(null)
  const [submitFeedback, setSubmitFeedback] = useState<string | null>(null)

  const { openModal, closeModal, clearTransaction } = useTransactionModal()
  const { grantRegistryRoles, isPending: isGrantPending } =
    useGrantRegistryRolesMutation()
  const { revokeRegistryRoles, isPending: isRevokePending } =
    useRevokeRegistryRolesMutation()

  const isPending = isGrantPending || isRevokePending

  useEffect(() => {
    if (!open) return
    setSelectedRoles(new Set(currentRoles))
    setPendingTx(null)
    setQueuedRevoke(null)
    setSubmitFeedback(null)
  }, [open, currentRoles])

  const toggleRole = (role: Role, checked: boolean) => {
    setSelectedRoles((prev) => {
      const next = new Set(prev)
      if (checked) next.add(role)
      else next.delete(role)
      return next
    })
    setSubmitFeedback(null)
  }

  const diff = useMemo(() => {
    const toGrant: Role[] = []
    const toRevoke: Role[] = []
    for (const role of selectedRoles) {
      if (!initialRoles.has(role)) toGrant.push(role)
    }
    for (const role of initialRoles) {
      if (!selectedRoles.has(role)) toRevoke.push(role)
    }
    return { toGrant, toRevoke }
  }, [selectedRoles, initialRoles])

  const hasChanges = diff.toGrant.length > 0 || diff.toRevoke.length > 0

  const isSelfEdit =
    !!account &&
    !!callerAddress &&
    account.toLowerCase() === callerAddress.toLowerCase()

  const selfSoleAdminRoles = useMemo<Set<Role>>(() => {
    if (!isSelfEdit || !rolesData || !account) return new Set()
    const accountLower = account.toLowerCase()
    const userRoles =
      rolesData.find((r) => r.account.toLowerCase() === accountLower)?.roles ??
      []
    const result = new Set<Role>()
    for (const role of userRoles) {
      if (!role.endsWith('_ADMIN')) continue
      const hasOtherHolder = rolesData.some(
        (r) =>
          r.account.toLowerCase() !== accountLower && r.roles.includes(role),
      )
      if (!hasOtherHolder) result.add(role as Role)
    }
    return result
  }, [isSelfEdit, rolesData, account])

  const adminLockoutRoles = useMemo<Role[]>(
    () => diff.toRevoke.filter((role) => selfSoleAdminRoles.has(role)),
    [diff.toRevoke, selfSoleAdminRoles],
  )
  const willLockOutAdmin = adminLockoutRoles.length > 0

  const runEdit = (toGrant: Role[], toRevoke: Role[]) => {
    if (!account || !walletClient?.account) return
    if (toGrant.length === 0 && toRevoke.length === 0) return

    if (toGrant.length > 0) {
      setPendingTx({ kind: 'grant', roles: toGrant })
      setQueuedRevoke(toRevoke.length > 0 ? toRevoke : null)
    } else {
      setPendingTx({ kind: 'revoke', roles: toRevoke })
      setQueuedRevoke(null)
    }
    openModal()
  }

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!hasChanges) {
      setSubmitFeedback('No changes to save')
      return
    }
    // Note: we deliberately do NOT block when `willLockOutAdmin`. The
    // destructive Alert above is the consent contract — the user is told
    // exactly what will happen and gets to decide.
    runEdit(diff.toGrant, diff.toRevoke)
  }

  const removableRoles = currentRoles.filter((role) => {
    const adminRole = role.endsWith('_ADMIN') ? role : (`${role}_ADMIN` as Role)
    return callerAdminRoles.has(adminRole)
  })

  const removeAdminLockoutRoles = removableRoles.filter((role) =>
    selfSoleAdminRoles.has(role),
  )
  const removeWillLockOutAdmin = removeAdminLockoutRoles.length > 0

  const showLockoutAlert = willLockOutAdmin || removeWillLockOutAdmin
  const lockoutCount = new Set([
    ...adminLockoutRoles,
    ...removeAdminLockoutRoles,
  ]).size

  const handleRemove = () => {
    if (removableRoles.length === 0) return
    runEdit([], removableRoles)
  }

  const handleDone = () => {
    closeModal()
    clearTransaction()
    setPendingTx(null)
    setQueuedRevoke(null)
    onOpenChange(false)
  }

  const handleStepDone = () => {
    clearTransaction()
  }

  const buildModalTransactions = (): Transaction[] => {
    if (!pendingTx || !account) return []

    const revokeRoles =
      pendingTx.kind === 'revoke' ? pendingTx.roles : queuedRevoke
    const hasRevokeStep = !!revokeRoles && revokeRoles.length > 0

    const steps: Transaction[] = []

    if (pendingTx.kind === 'grant') {
      steps.push({
        id: GRANT_TX_ID,
        title: 'Grant roles',
        transactionName: 'Grant registry roles',
        estimatedGasCost: 0.0001,
        onStart: () =>
          grantRegistryRoles({
            registryAddress,
            account,
            roles: pendingTx.roles,
            id: GRANT_TX_ID,
          }),
        onDone: hasRevokeStep ? handleStepDone : handleDone,
      })
    }

    if (hasRevokeStep) {
      steps.push({
        id: REVOKE_TX_ID,
        title: 'Revoke roles',
        transactionName: 'Revoke registry roles',
        estimatedGasCost: 0.0001,
        onStart: () =>
          revokeRegistryRoles({
            registryAddress,
            account,
            roles: revokeRoles,
            id: REVOKE_TX_ID,
          }),
        onDone: handleDone,
      })
    }

    return steps
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="sm:max-w-3xl bg-background overflow-y-auto p-0"
      >
        <div className="p-6 flex flex-col gap-6 h-full">
          <SheetHeader className="p-0 pt-4 flex flex-row items-center justify-between gap-4">
            <SheetTitle className="font-sans text-heading font-medium">
              {titleLabel}
            </SheetTitle>
            <Button
              type="button"
              variant="outline"
              onClick={handleRemove}
              disabled={removableRoles.length === 0 || isPending}
            >
              <Trash2 className="size-4" />
              Remove user
            </Button>
          </SheetHeader>

          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            <Field>
              <div
                className={cn(
                  'border-t rounded-sm divide-y transition-colors',
                  {
                    'opacity-50 pointer-events-none': isPending,
                  },
                )}
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
                          ? `Your account does not hold ${permission.adminKey} on this registry and cannot change this role.`
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
                        <div className="flex items-center gap-2 w-24">
                          <Checkbox
                            id={`edit-${adminKey}`}
                            checked={selectedRoles.has(adminKey)}
                            onCheckedChange={(c) =>
                              toggleRole(adminKey, c === true)
                            }
                            disabled={callerLacksAdmin}
                          />
                          <Label
                            htmlFor={`edit-${adminKey}`}
                            className="font-normal cursor-pointer text-muted-foreground"
                          >
                            Admin
                          </Label>
                        </div>
                        <div className="flex items-center gap-2 w-24">
                          {userKey ? (
                            <>
                              <Checkbox
                                id={`edit-${userKey}`}
                                checked={selectedRoles.has(userKey as Role)}
                                onCheckedChange={(c) =>
                                  toggleRole(userKey as Role, c === true)
                                }
                                disabled={callerLacksAdmin}
                              />
                              <Label
                                htmlFor={`edit-${userKey}`}
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

            {showLockoutAlert && (
              <Alert variant="warning">
                <AlertDescription>
                  You're the only Admin for{' '}
                  {lockoutCount === 1 ? 'this role' : 'these roles'}. Removing{' '}
                  {lockoutCount === 1 ? 'it' : 'them'} will permanently lock out
                  admin control.
                </AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end">
              <Button type="submit" variant="default" disabled={!hasChanges}>
                {match({ isPending })
                  .with({ isPending: true }, () => 'Saving...')
                  .otherwise(() => 'Save')}
              </Button>
            </div>
          </form>

          <RegistryUserRoleHistory
            registryAddress={registryAddress}
            account={account}
          />

          <TransactionModal transactions={buildModalTransactions()} />
        </div>
      </SheetContent>
    </Sheet>
  )
}
