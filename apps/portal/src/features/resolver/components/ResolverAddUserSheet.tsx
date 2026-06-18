import type { ResolverRole } from '@ensdomains/ensjs/public/v2'
import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from 'react'
import { match } from 'ts-pattern'
import { type Address, isAddress } from 'viem'
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
import { resolveAddressOrName } from '@/features/roles/helpers/addUser.handlers'
import { TransactionModal } from '@/features/transaction-manager/components/TransactionModal'
import { useTransactionModal } from '@/features/transaction-manager/hooks/useTransactionModal'
import { resolverPermissions } from '@/lib/roles/resolverRoles'
import { cn } from '@/lib/utils'
import { sepoliaWithEns } from '@/lib/wagmi'
import { truncateAddress } from '@/utils/formatting/truncateAddress'

const GRANT_RESOLVER_ROLES_TX_ID = 'tx-grant-resolver-roles'
const RESOLVE_DEBOUNCE_MS = 500
// Empty string = root resource (roles apply to all names).
const ROOT_NODE_VALUE = ''

const RolePermissionList = ({
  selectedRoles,
  onToggle,
  disabled,
  isInvalid,
}: {
  readonly selectedRoles: Set<ResolverRole>
  readonly onToggle: (role: ResolverRole, checked: boolean) => void
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

const chainId = sepoliaWithEns.id

type ResolverAddUserSheetProps = {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly resolverAddress: Address
  readonly nodes: readonly ResolverNode[]
}

export const ResolverAddUserSheet = ({
  open,
  onOpenChange,
  resolverAddress,
  nodes,
}: ResolverAddUserSheetProps) => {
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
    field: 'roles'
    message: string
  } | null>(null)

  const [address, setAddress] = useState<Address | null>(null)
  const [isResolvingAddress, setIsResolvingAddress] = useState(false)
  const [resolveError, setResolveError] = useState<string | null>(null)
  const resolveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestResolveRef = useRef<string>('')

  const { openModal, closeModal, clearTransaction } = useTransactionModal()
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
    id: GRANT_RESOLVER_ROLES_TX_ID,
  })

  useEffect(() => {
    if (open) return
    if (resolveTimeoutRef.current) clearTimeout(resolveTimeoutRef.current)
    latestResolveRef.current = ''
    setNameOrAddressInput('')
    setSelectedNode(ROOT_NODE_VALUE)
    setSelectedRoles(new Set())
    setPendingGrant(null)
    setFormError(null)
    setAddress(null)
    setIsResolvingAddress(false)
    setResolveError(null)
    reset()
  }, [open, reset])

  const resolveInput = async (value: string) => {
    if (!publicClient) {
      setIsResolvingAddress(false)
      setResolveError('Public client not available')
      return
    }
    try {
      const resolved = await resolveAddressOrName({
        client: publicClient,
        nameOrAddress: value,
      })
      if (latestResolveRef.current !== value) return
      setAddress(resolved)
      setIsResolvingAddress(false)
      if (!resolved) setResolveError(`Could not resolve address for ${value}`)
    } catch (error) {
      if (latestResolveRef.current !== value) return
      setAddress(null)
      setIsResolvingAddress(false)
      setResolveError(
        error instanceof Error ? error.message : 'Failed to resolve ENS name',
      )
    }
  }

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.currentTarget.value.trim()
    latestResolveRef.current = value
    setNameOrAddressInput(value)
    setFormError(null)
    setResolveError(null)

    if (resolveTimeoutRef.current) clearTimeout(resolveTimeoutRef.current)

    // Only valid (per the input pattern) name/address shapes resolve.
    if (!e.currentTarget.checkValidity()) {
      setAddress(null)
      setIsResolvingAddress(false)
      return
    }

    if (isAddress(value)) {
      setAddress(value)
      setIsResolvingAddress(false)
      return
    }

    setAddress(null)
    setIsResolvingAddress(true)
    resolveTimeoutRef.current = setTimeout(
      () => resolveInput(value),
      RESOLVE_DEBOUNCE_MS,
    )
  }

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
    !!address && !isResolvingAddress && selectedRoles.size > 0 && !isSuccess

  const nameOptions = nodes.map((n) => n.name).filter(Boolean)

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setFormError(null)

    if (!e.currentTarget.reportValidity()) return

    const roles = Array.from(selectedRoles)
    if (roles.length === 0) {
      setFormError({
        field: 'roles',
        message: 'Please select at least one role',
      })
      return
    }

    if (isResolvingAddress || !address) return

    setPendingGrant({ name: selectedNode, account: address, roles })
    openModal()
  }

  const handleStartTransaction = () => {
    if (!pendingGrant) return
    grantResolverRoles(pendingGrant)
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
            <Field
              data-invalid={
                nameOrAddressInput.length > 0 && !isResolvingAddress && !address
              }
            >
              <Input
                id="user"
                name="user"
                placeholder="User name or address"
                required
                pattern="(?:[-A-Za-z0-9]+[.][A-Za-z]+|0x[a-fA-F0-9]{40})"
                value={nameOrAddressInput}
                disabled={isPending || isSuccess}
                aria-invalid={
                  nameOrAddressInput.length > 0 &&
                  !isResolvingAddress &&
                  !address
                }
                onChange={handleInputChange}
                className="h-12 bg-background border"
              />
              {isResolvingAddress && (
                <p className="text-sm mt-1.5 text-muted-foreground">
                  Resolving address...
                </p>
              )}
              {!isResolvingAddress && address && (
                <p className="text-sm mt-1.5 text-muted-foreground">
                  Resolved: {truncateAddress(address, 6, 4)}
                </p>
              )}
              {!isResolvingAddress && resolveError && (
                <p className="text-sm mt-1.5 text-danger">{resolveError}</p>
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
                isInvalid={formError?.field === 'roles'}
              />
              {formError?.field === 'roles' && (
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
