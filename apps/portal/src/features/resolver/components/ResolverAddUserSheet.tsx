import type { ResolverRole } from '@ensdomains/ensjs/public/v2'
import { type FormEvent, useEffect, useState } from 'react'
import { match } from 'ts-pattern'
import type { Address } from 'viem'
import { usePublicClient, useWalletClient } from 'wagmi'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox'
import { Field, FieldError } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { NameAvatar } from '@/features/profile/components/NameAvatar'
import { useGrantResolverRoles } from '@/features/resolver/hooks/useGrantResolverRoles'
import type { ResolverNode } from '@/features/resolver/hooks/useResolverOverview'
import { useResolvedRoleAccountAddress } from '@/features/roles/hooks/useResolvedRoleAccountAddress'
import { TransactionModal } from '@/features/transaction-manager/components/TransactionModal'
import { useTransactionModal } from '@/features/transaction-manager/hooks/useTransactionModal'
import { resolverPermissions } from '@/lib/roles/resolverRoles'
import { cn } from '@/lib/utils'
import { sepoliaWithEns, wagmiConfig } from '@/lib/wagmi'
import { truncateAddress } from '@/utils/formatting/truncateAddress'

const GRANT_RESOLVER_ROLES_TX_ID = 'tx-grant-resolver-roles'
// Empty string = root resource (roles apply to all names).
const ROOT_NODE_VALUE = ''
// Module-level client for the resolver hook — matches the name-roles add flow.
const client = wagmiConfig.getClient()

const RolePermissionList = ({
  selectedRoles,
  onToggle,
  disabled,
  invalid,
}: {
  selectedRoles: Set<ResolverRole>
  onToggle: (role: ResolverRole, checked: boolean) => void
  disabled: boolean
  invalid: boolean
}) => (
  <div
    className={cn(
      'border border-border rounded-sm overflow-hidden transition-colors',
      disabled && 'opacity-50 pointer-events-none',
    )}
    aria-invalid={invalid}
  >
    {resolverPermissions.map((permission, index) => {
      const role = permission.key as ResolverRole

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
                id={`add-${permission.key}-manager`}
                checked={selectedRoles.has(role)}
                onCheckedChange={(checked) =>
                  onToggle(role, checked as boolean)
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
      )
    })}
  </div>
)

type ResolverAddUserSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  resolverAddress: Address
  nodes: readonly ResolverNode[]
}

export const ResolverAddUserSheet = ({
  open,
  onOpenChange,
  resolverAddress,
  nodes,
}: ResolverAddUserSheetProps) => {
  const chainId = sepoliaWithEns.id
  const { data: walletClient } = useWalletClient({ chainId })
  const publicClient = usePublicClient({ chainId })

  const [nameOrAddressInput, setNameOrAddressInput] = useState('')
  const [selectedNode, setSelectedNode] = useState<string>(ROOT_NODE_VALUE)
  const [selectedRoles, setSelectedRoles] = useState<Set<ResolverRole>>(
    new Set(),
  )
  const [pendingGrant, setPendingGrant] = useState<{
    name: string
    account: Address
    roles: ResolverRole[]
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
  const mutation = useGrantResolverRoles({
    resolverAddress,
    walletClient,
    publicClient,
    chainId,
    id: GRANT_RESOLVER_ROLES_TX_ID,
  })
  const { isPending, isSuccess, reset } = mutation

  // Reset form + mutation when the sheet closes, so success state doesn't stick.
  useEffect(() => {
    if (open) return
    setNameOrAddressInput('')
    setSelectedNode(ROOT_NODE_VALUE)
    setSelectedRoles(new Set())
    setPendingGrant(null)
    setFormError(null)
    reset()
  }, [open, reset])

  const toggleRole = (role: ResolverRole, checked: boolean) => {
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

  const nameOptions = nodes.map((n) => n.name).filter(Boolean)

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

    setPendingGrant({ name: selectedNode, account: address, roles })
    openModal()
  }

  const handleStartTransaction = () => {
    if (!pendingGrant) return
    mutation.mutate(pendingGrant)
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

            <Field>
              <Combobox
                value={selectedNode}
                onValueChange={(v) => setSelectedNode(v ?? ROOT_NODE_VALUE)}
              >
                <ComboboxInput placeholder="Root (all nodes)" />
                <ComboboxContent>
                  <ComboboxList>
                    <ComboboxItem value={ROOT_NODE_VALUE}>
                      <span className="text-sm text-muted-foreground">
                        Root (all nodes)
                      </span>
                    </ComboboxItem>
                    {nameOptions.map((name) => {
                      const node = nodes.find((n) => n.name === name)
                      return (
                        <ComboboxItem key={name} value={name}>
                          <div className="flex items-center gap-2">
                            <NameAvatar
                              name={name}
                              width="24px"
                              height="24px"
                              rounded="rounded-sm"
                            />
                            <span className="font-mono text-sm">{name}</span>
                            {node?.owner?.id && (
                              <span className="text-xs text-muted-foreground truncate ml-auto">
                                {truncateAddress(
                                  node.owner.id as Address,
                                  6,
                                  4,
                                )}
                              </span>
                            )}
                          </div>
                        </ComboboxItem>
                      )
                    })}
                    <ComboboxEmpty>No names found</ComboboxEmpty>
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
            </Field>

            <Field data-invalid={formError?.field === 'roles'}>
              <RolePermissionList
                selectedRoles={selectedRoles}
                onToggle={toggleRole}
                disabled={isPending || isSuccess}
                invalid={formError?.field === 'roles'}
              />
              {formError && (
                <FieldError className="mt-1.5">{formError.message}</FieldError>
              )}
            </Field>

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
                id: GRANT_RESOLVER_ROLES_TX_ID,
                title: 'Grant resolver roles',
                transactionName: `Grant resolver roles for ${pendingGrant?.name || '(root)'}`,
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
