import type { Role } from '@ensdomains/ensjs/utils/v2'
import { useQuery } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { match } from 'ts-pattern'
import type { Address } from 'viem'
import { useEnsName, useWalletClient } from 'wagmi'
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
import { useGrantRegistryRoles } from '@/features/registry/hooks/useGrantRegistryRoles'
import { useRevokeRegistryRoles } from '@/features/registry/hooks/useRevokeRegistryRoles'
import { TransactionModal } from '@/features/transaction-manager/components/TransactionModal'
import { useTransactionModal } from '@/features/transaction-manager/hooks/useTransactionModal'
import { registryRootPermissions } from '@/lib/roles/permissions'
import { cn } from '@/lib/utils'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import { getRegistryRolesQueryOptions } from '../../hooks/useRegistryRoles'
import { RegistryUserActivity } from './RegistryUserActivity'

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
    ? (primaryName ?? truncateAddress(account, 6, 4, '...'))
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
    useGrantRegistryRoles()
  const { revokeRegistryRoles, isPending: isRevokePending } =
    useRevokeRegistryRoles()

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
    runEdit(diff.toGrant, diff.toRevoke)
  }

  const handleRemove = () => {
    if (currentRoles.length === 0) return
    runEdit([], Array.from(currentRoles))
  }

  const handleStartTransaction = () => {
    if (!pendingTx || !account || !walletClient?.account) return
    if (pendingTx.kind === 'grant') {
      grantRegistryRoles({
        registryAddress,
        account,
        roles: pendingTx.roles,
        id: GRANT_TX_ID,
      })
    } else {
      revokeRegistryRoles({
        registryAddress,
        account,
        roles: pendingTx.roles,
        id: REVOKE_TX_ID,
      })
    }
  }

  const handleDone = () => {
    if (queuedRevoke && queuedRevoke.length > 0) {
      const next = queuedRevoke
      setQueuedRevoke(null)
      setPendingTx({ kind: 'revoke', roles: next })
      clearTransaction()
      return
    }
    closeModal()
    clearTransaction()
    setPendingTx(null)
    onOpenChange(false)
  }

  const modalTransactionId =
    pendingTx?.kind === 'revoke' ? REVOKE_TX_ID : GRANT_TX_ID
  const modalTitle =
    pendingTx?.kind === 'revoke' ? 'Revoke roles' : 'Grant roles'

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
              disabled={currentRoles.length === 0 || isPending}
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

            <div className="flex justify-end">
              <Button
                type="submit"
                variant="default"
                disabled={!hasChanges || isPending}
              >
                {match({ isPending })
                  .with({ isPending: true }, () => 'Saving...')
                  .otherwise(() => 'Save')}
              </Button>
            </div>
          </form>

          <RegistryUserActivity
            registryAddress={registryAddress}
            account={account}
          />

          <TransactionModal
            transactions={[
              {
                id: modalTransactionId,
                title: modalTitle,
                transactionName:
                  pendingTx?.kind === 'revoke'
                    ? 'Revoke registry roles'
                    : 'Grant registry roles',
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
