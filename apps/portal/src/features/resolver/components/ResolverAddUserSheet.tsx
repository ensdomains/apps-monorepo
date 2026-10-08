import { scopeTransactionId } from '@ens-apps/transaction-manager'
import { type FormEvent, useEffect, useState } from 'react'
import { match } from 'ts-pattern'
import type { Address } from 'viem'
import { usePublicClient, useWalletClient } from 'wagmi'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { AddressNameInput } from '@/features/address/components/AddressNameInput'
import { useAddressResolution } from '@/features/address/hooks/useAddressResolution'
import {
  describeGrantScope,
  prepareGrantResolverRolesTransaction,
  type ResolverGrantScope,
} from '@/features/resolver/helpers/grantResolverRoles'
import { useGrantResolverRoles } from '@/features/resolver/hooks/useGrantResolverRoles'
import { TransactionModal } from '@/features/transaction-manager/components/TransactionModal'
import { useFlowAttempt } from '@/features/transaction-manager/hooks/useFlowAttempt'
import { useTransactionModal } from '@/features/transaction-manager/hooks/useTransactionModal'
import {
  type ResolverPermissionKey,
  type ResolverSetterScope,
  resolverPermissions,
} from '@/lib/roles/resolverRoles'
import { cn } from '@/lib/utils'
import { sepoliaWithEns } from '@/lib/wagmi'

const GRANT_RESOLVER_ROLES_TX_ID = 'tx-grant-resolver-roles'

/**
 * Where the grant applies. `root` is every name on the resolver; the setter
 * scopes narrow one role to a single argument (post-audit-2
 * `grantSetterRoles`). Per-name grants no longer exist.
 */
type ScopeKind = 'root' | 'text' | 'address'

const SCOPE_OPTIONS: ReadonlyArray<{
  value: ScopeKind
  label: string
  hint: string
}> = [
  { value: 'root', label: 'All names', hint: 'Roles apply to every name' },
  {
    value: 'text',
    label: 'One text key',
    hint: 'Set Text for a single key, on every name',
  },
  {
    value: 'address',
    label: 'One coin type',
    hint: 'Set Address for a single coin type, on every name',
  },
]

const RolePermissionList = ({
  selectedRoles,
  onToggle,
  disabled,
  isInvalid,
}: {
  readonly selectedRoles: Set<ResolverPermissionKey>
  readonly onToggle: (role: ResolverPermissionKey, checked: boolean) => void
  readonly disabled: boolean
  readonly isInvalid: boolean
}) => (
  <div
    className={cn(
      'border border-border rounded-sm overflow-hidden transition-colors',
      disabled && 'opacity-50 pointer-events-none',
    )}
    aria-invalid={isInvalid}
  >
    {resolverPermissions.map((permission, index) => (
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
              id={`add-${permission.key}-manager`}
              checked={selectedRoles.has(permission.key)}
              onCheckedChange={(checked) =>
                onToggle(permission.key, checked as boolean)
              }
            />
            <Label
              htmlFor={`add-${permission.key}-manager`}
              className="font-medium cursor-pointer"
            >
              User
            </Label>
          </div>
          <div className="flex items-center gap-2 min-w-24">
            <Checkbox id={`add-${permission.key}-admin`} disabled />
            <Label
              htmlFor={`add-${permission.key}-admin`}
              className="font-medium cursor-pointer"
            >
              Admin
            </Label>
          </div>
        </div>
      </div>
    ))}
  </div>
)

const chainId = sepoliaWithEns.id

type ResolverAddUserSheetProps = {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly resolverAddress: Address
}

const parseCoinType = (value: string): bigint | null => {
  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed)) return null
  return BigInt(trimmed)
}

export const ResolverAddUserSheet = ({
  open,
  onOpenChange,
  resolverAddress,
}: ResolverAddUserSheetProps) => {
  const { data: walletClient } = useWalletClient({ chainId })
  const publicClient = usePublicClient({ chainId })

  const [nameOrAddressInput, setNameOrAddressInput] = useState('')
  const [scopeKind, setScopeKind] = useState<ScopeKind>('root')
  const [scopeArgument, setScopeArgument] = useState('')
  const [selectedRoles, setSelectedRoles] = useState<
    Set<ResolverPermissionKey>
  >(new Set())
  const [pendingGrant, setPendingGrant] = useState<{
    account: Address
    scope: ResolverGrantScope
  } | null>(null)
  const [formError, setFormError] = useState<{
    field: 'roles' | 'scope'
    message: string
  } | null>(null)

  const resolution = useAddressResolution(nameOrAddressInput)
  const { address, isResolving: isResolvingAddress, isInvalid } = resolution

  const { closeModal, clearTransaction } = useTransactionModal()
  // Names this attempt, so a second grant in the same session can't be served
  // by the finished actor the first one left behind.
  const attempt = useFlowAttempt()
  const {
    mutate: grantResolverRoles,
    isPending,
    isSuccess,
    reset,
  } = useGrantResolverRoles({
    resolverAddress,
    walletClient,
    publicClient,
    chainId,
    id: scopeTransactionId(GRANT_RESOLVER_ROLES_TX_ID, attempt.scope),
  })

  useEffect(() => {
    if (open) return
    setNameOrAddressInput('')
    setScopeKind('root')
    setScopeArgument('')
    setSelectedRoles(new Set())
    setPendingGrant(null)
    setFormError(null)
    attempt.end()
    reset()
  }, [open, reset, attempt.end])

  const handleInputChange = (value: string) => {
    setNameOrAddressInput(value)
    setFormError(null)
  }

  const toggleRole = (role: ResolverPermissionKey, checked: boolean) => {
    setSelectedRoles((prev) => {
      const next = new Set(prev)
      if (checked) next.add(role)
      else next.delete(role)
      return next
    })
    setFormError(null)
  }

  const setterScope: ResolverSetterScope | null = match(scopeKind)
    .with('root', () => null)
    .with('text', () =>
      scopeArgument.trim()
        ? ({
            kind: 'text',
            key: scopeArgument.trim(),
          } satisfies ResolverSetterScope)
        : null,
    )
    .with('address', () => {
      const coinType = parseCoinType(scopeArgument)
      return coinType === null
        ? null
        : ({ kind: 'address', coinType } satisfies ResolverSetterScope)
    })
    .exhaustive()

  const scopeReady = scopeKind === 'root' || setterScope !== null
  const rolesReady = scopeKind !== 'root' || selectedRoles.size > 0

  const canSave =
    !!address && !isResolvingAddress && scopeReady && rolesReady && !isSuccess

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setFormError(null)

    if (!e.currentTarget.reportValidity()) return

    let scope: ResolverGrantScope
    if (scopeKind === 'root') {
      const roles = Array.from(selectedRoles)
      if (roles.length === 0) {
        setFormError({
          field: 'roles',
          message: 'Please select at least one role',
        })
        return
      }
      scope = { type: 'root', roles }
    } else {
      if (!setterScope) {
        setFormError({
          field: 'scope',
          message:
            scopeKind === 'text'
              ? 'Enter the text key to scope the role to'
              : 'Enter a numeric coin type (60 for Ethereum)',
        })
        return
      }
      scope = { type: 'setter', setter: setterScope }
    }

    const signer = walletClient?.account?.address
    if (isResolvingAddress || !address || !signer) return

    setPendingGrant({ account: address, scope })
    attempt.start(signer)
  }

  const handleStartTransaction = () => {
    if (!pendingGrant) return
    grantResolverRoles(pendingGrant)
  }

  const handleDone = () => {
    closeModal()
    clearTransaction()
    setPendingGrant(null)
    attempt.end()
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="bg-background p-0">
        <div className="h-full overflow-y-auto">
          <div className="p-6 flex flex-col gap-6 h-full">
            <SheetHeader className="p-0">
              <SheetTitle className="font-sans text-h2">Add user</SheetTitle>
            </SheetHeader>

            <form
              onSubmit={handleSubmit}
              className="flex flex-col gap-6 flex-1"
            >
              <Field data-invalid={isInvalid}>
                <AddressNameInput
                  id="user"
                  name="user"
                  placeholder="User name or address"
                  required
                  value={nameOrAddressInput}
                  onChange={handleInputChange}
                  resolution={resolution}
                  disabled={isPending || isSuccess}
                  className="h-12 bg-background border"
                />
              </Field>

              <Field data-invalid={formError?.field === 'scope'}>
                <FieldLabel>Scope</FieldLabel>
                <RadioGroup
                  value={scopeKind}
                  onValueChange={(value) => {
                    setScopeKind(value as ScopeKind)
                    setScopeArgument('')
                    setFormError(null)
                  }}
                  disabled={isPending || isSuccess}
                  className="gap-3"
                >
                  {SCOPE_OPTIONS.map((option) => (
                    <div key={option.value} className="flex items-start gap-3">
                      <RadioGroupItem
                        id={`scope-${option.value}`}
                        value={option.value}
                        className="mt-0.5"
                      />
                      <Label
                        htmlFor={`scope-${option.value}`}
                        className="flex flex-col gap-0.5 cursor-pointer font-normal"
                      >
                        <span className="font-medium">{option.label}</span>
                        <span className="text-sm text-muted-foreground">
                          {option.hint}
                        </span>
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
                {scopeKind !== 'root' && (
                  <Input
                    aria-label={scopeKind === 'text' ? 'Text key' : 'Coin type'}
                    placeholder={
                      scopeKind === 'text' ? 'avatar' : '60 (Ethereum)'
                    }
                    value={scopeArgument}
                    onChange={(e) => {
                      setScopeArgument(e.target.value)
                      setFormError(null)
                    }}
                    disabled={isPending || isSuccess}
                    className="h-12 bg-background border font-mono"
                  />
                )}
                {formError?.field === 'scope' && (
                  <FieldError className="mt-1.5">
                    {formError.message}
                  </FieldError>
                )}
              </Field>

              {scopeKind === 'root' ? (
                <Field data-invalid={formError?.field === 'roles'}>
                  <RolePermissionList
                    selectedRoles={selectedRoles}
                    onToggle={toggleRole}
                    disabled={isPending || isSuccess}
                    isInvalid={formError?.field === 'roles'}
                  />
                  {formError?.field === 'roles' && (
                    <FieldError className="mt-1.5">
                      {formError.message}
                    </FieldError>
                  )}
                </Field>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Grants{' '}
                  <span className="font-medium text-foreground">
                    {scopeKind === 'text' ? 'Set Text' : 'Set Address'}
                  </span>{' '}
                  for that argument only, on every name of this resolver.
                </p>
              )}

              <div className="flex justify-end pb-3">
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
                  id: scopeTransactionId(
                    GRANT_RESOLVER_ROLES_TX_ID,
                    attempt.scope,
                  ),
                  title: 'Grant resolver roles',
                  transactionName: `Grant resolver roles for ${pendingGrant ? describeGrantScope(pendingGrant.scope) : ''}`,
                  // Deterministic once the user has confirmed the grant, so the
                  // modal can estimate gas the moment it opens.
                  intent: {
                    prepare: pendingGrant
                      ? ({ walletClient, chainId }) =>
                          prepareGrantResolverRolesTransaction({
                            resolverAddress,
                            account: pendingGrant.account,
                            scope: pendingGrant.scope,
                            walletClient,
                            chainId,
                          })
                      : undefined,
                  },
                  onStart: handleStartTransaction,
                  onDone: handleDone,
                },
              ]}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
