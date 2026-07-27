import type { Role } from '@ensdomains/ensjs/utils/v2'
import { useQuery } from '@tanstack/react-query'
import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from 'react'
import { match } from 'ts-pattern'
import { type Address, isAddress } from 'viem'
import { useWalletClient } from 'wagmi'
import { Button } from '@/components/ui/button'
import { Field, FieldError } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useGrantRegistryRolesMutation } from '@/features/registry/hooks/useGrantRegistryRoles'
import { resolveAddressOrName } from '@/features/roles/helpers/addUser.handlers'
import { TransactionModal } from '@/features/transaction-manager/components/TransactionModal'
import { useTransactionModal } from '@/features/transaction-manager/hooks/useTransactionModal'
import { wagmiConfig } from '@/lib/wagmi'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import { getRegistryRolesQueryOptions } from '../../hooks/useRegistryRoles'
import { getAccountAdminRoles } from '../../utils/registryRoleAccess'
import { RegistryRolePermissionList } from './RegistryRolePermissionList'

const GRANT_REGISTRY_ROLES_TX_ID = 'tx-grant-registry-roles'
const RESOLVE_DEBOUNCE_MS = 500
// Module-level client for resolution — matches /$name/roles/add-user.tsx
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

  const callerAdminRoles = getAccountAdminRoles(rolesData, callerAddress)

  const [nameOrAddressInput, setNameOrAddressInput] = useState('')
  // Controlled selection so the Save button can disable until at least one
  // checkbox is checked (matches the design's gray/disabled Save state).
  const [selectedRoles, setSelectedRoles] = useState<Set<Role>>(new Set())
  const [pendingGrant, setPendingGrant] = useState<{
    account: Address
    roles: Role[]
  } | null>(null)
  // Single validation-error state — the message and which field it belongs to
  // are always set/cleared together.
  const [formError, setFormError] = useState<{
    field: 'roles'
    message: string
  } | null>(null)

  const [address, setAddress] = useState<Address | null>(null)
  const [isResolvingAddress, setIsResolvingAddress] = useState(false)
  const [resolveError, setResolveError] = useState<string | null>(null)
  const resolveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { openModal, closeModal, clearTransaction } = useTransactionModal()
  const { grantRegistryRoles, isPending, isSuccess, reset } =
    useGrantRegistryRolesMutation()

  // Reset form state AND the underlying mutation when the sheet closes —
  // otherwise `isSuccess` sticks across re-opens, leaving the input disabled
  // and Save permanently gated.
  useEffect(() => {
    if (open) return
    if (resolveTimeoutRef.current) clearTimeout(resolveTimeoutRef.current)
    setNameOrAddressInput('')
    setSelectedRoles(new Set())
    setPendingGrant(null)
    setFormError(null)
    setAddress(null)
    setIsResolvingAddress(false)
    setResolveError(null)
    reset()
  }, [open, reset])

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.currentTarget.value.trim()
    setNameOrAddressInput(value)
    setFormError(null)
    setResolveError(null)

    if (resolveTimeoutRef.current) clearTimeout(resolveTimeoutRef.current)

    if (isAddress(value)) {
      setAddress(value)
      setIsResolvingAddress(false)
      return
    }

    if (!value.includes('.')) {
      setAddress(null)
      setIsResolvingAddress(false)
      return
    }

    setAddress(null)
    setIsResolvingAddress(true)
    resolveTimeoutRef.current = setTimeout(async () => {
      try {
        const resolved = await resolveAddressOrName({
          client,
          nameOrAddress: value,
        })
        setAddress(resolved)
        setIsResolvingAddress(false)
        if (!resolved) setResolveError(`Could not resolve address for ${value}`)
      } catch (error) {
        setAddress(null)
        setIsResolvingAddress(false)
        setResolveError(
          error instanceof Error ? error.message : 'Failed to resolve ENS name',
        )
      }
    }, RESOLVE_DEBOUNCE_MS)
  }

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
    !!address && !isResolvingAddress && selectedRoles.size > 0 && !isSuccess

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

    if (isResolvingAddress || !address) return

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
            <SheetTitle className="font-sans text-h2">Add user</SheetTitle>
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

            <Field data-invalid={formError?.field === 'roles'}>
              <RegistryRolePermissionList
                selectedRoles={selectedRoles}
                callerAdminRoles={callerAdminRoles}
                onToggle={toggleRole}
                disabled={isPending || isSuccess}
                invalid={formError?.field === 'roles'}
              />
              {formError?.field === 'roles' && (
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
