import type { Role } from '@ensdomains/ensjs/utils/v2'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeftIcon } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { match } from 'ts-pattern'
import type { Address } from 'viem'
import { useWalletClient } from 'wagmi'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { getNameRegistriesQueryOptions } from '@/features/registry/hooks/useNameRegistryDiscovery'
import { getSubnameRegistryAddress } from '@/features/registry/utils/getSubnameRegistryAddress'
import { useGrantRoles } from '@/features/roles/hooks/useGrantRoles'
import { useResolvedRoleAccountAddress } from '@/features/roles/hooks/useResolvedRoleAccountAddress'
import { TransactionModal } from '@/features/transaction-manager/components/TransactionModal'
import { useTransactionModal } from '@/features/transaction-manager/hooks/useTransactionModal'
import { isManagerRoleSettable, permissions } from '@/lib/roles/permissions'
import { cn } from '@/lib/utils'
import { wagmiConfig } from '@/lib/wagmi'

const GRANT_ROLES_TRANSACTION_ID = 'tx-grant-roles'
const client = wagmiConfig.getClient()

export const Route = createFileRoute('/$name/roles/add-user')({
  component: RouteComponent,
})

function RouteComponent() {
  const { name } = Route.useParams()
  const navigate = useNavigate()

  const [nameOrAddressInput, setNameOrAddressInput] = useState('')
  const [pendingGrant, setPendingGrant] = useState<{
    account: Address
    roles: Role[]
  } | null>(null)

  const { data: walletClient } = useWalletClient()

  const labels = name.split('.')
  const is3LD = labels.length === 3

  const { data: ownerData } = useQuery({
    ...getEnsOwnerQueryOptions({ name }),
    enabled: name.endsWith('.eth'),
  })

  const { data: registriesData } = useQuery({
    ...getNameRegistriesQueryOptions({ name }),
    enabled: is3LD && ownerData?.protocolVersion === 'ENSv2',
  })

  const registryAddress = is3LD
    ? getSubnameRegistryAddress(registriesData ?? null)
    : ownerData?.registryAddress

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
  const { grantRoles, isPending, isSuccess } = useGrantRoles()

  const [submitFeedback, setSubmitFeedback] = useState<string | null>(null)
  const [invalidField, setInvalidField] = useState<'roles' | 'address' | null>(
    null,
  )

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setSubmitFeedback(null)
    setInvalidField(null)
    if (!e.currentTarget.reportValidity()) return

    const fd = new FormData(e.currentTarget)
    const roles: Role[] = []

    for (const [k, v] of fd.entries()) {
      if (v === 'on') {
        roles.push(k as Role)
      }
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
    if (!pendingGrant || !walletClient?.account || !registryAddress) return

    grantRoles({
      name,
      account: pendingGrant.account,
      roles: pendingGrant.roles,
      id: GRANT_ROLES_TRANSACTION_ID,
      registryAddress,
    })
  }

  const handleDone = () => {
    closeModal()
    clearTransaction()
    setPendingGrant(null)
    navigate({ to: '/$name/roles', params: { name } })
  }

  if (!walletClient?.account) return <div>Not connected.</div>

  return (
    <div className="flex flex-col gap-4 p-4 w-full lg:max-w-2xl xl:max-w-5xl mx-auto">
      <Link to="/$name/roles" params={{ name }}>
        <Button variant="ghost" className="flex items-center gap-2 -ml-2">
          <ArrowLeftIcon className="size-4" />
          Back
        </Button>
      </Link>

      <h1 className="text-heading font-medium leading-none">Add user</h1>

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
            placeholder="ens.eth"
            required
            disabled={isPending || isSuccess}
            aria-invalid={invalidField === 'address'}
            onChange={(e) => {
              const nameOrAddress = e.currentTarget.value.trim()

              if (!e.currentTarget.checkValidity()) {
                setNameOrAddressInput('')
                return
              }

              setNameOrAddressInput(nameOrAddress)
            }}
            pattern="(?:[\u002DA-Za-z0-9]+[.]eth|0x[a-fA-F0-9]{40})"
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
              const isManagerRoleDisabled = !isManagerRoleSettable(
                permission.key,
              )

              return (
                <div
                  key={permission.key}
                  className={cn(
                    'flex items-center justify-between p-4 gap-4',
                    isManagerRoleDisabled && 'text-muted-foreground',
                  )}
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
                      <Checkbox
                        name={`${permission.key}_ADMIN`}
                        id={`${permission.key}_ADMIN`}
                        disabled={true}
                      />
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
            <div className="flex items-center justify-between p-4 gap-4 text-muted-foreground">
              <div className="flex flex-col gap-1 flex-1">
                <div className="font-medium">Can transfer admin</div>
                <div className="text-sm text-muted-foreground">
                  Administrator role to transfer a name
                </div>
              </div>
              <div className="flex items-center gap-8">
                <div className="flex items-center gap-2">
                  <Checkbox
                    name="ROLE_CAN_TRANSFER_ADMIN"
                    id="ROLE_CAN_TRANSFER_ADMIN"
                    disabled
                  />
                  <Label
                    htmlFor="ROLE_CAN_TRANSFER_ADMIN"
                    className="font-normal cursor-pointer text-muted-foreground"
                  >
                    Admin
                  </Label>
                </div>
              </div>
            </div>
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
            id: GRANT_ROLES_TRANSACTION_ID,
            title: 'Grant roles',
            transactionName: `Grant roles for ${name}`,
            estimatedGasCost: 0.0001,
            onStart: handleStartTransaction,
            onDone: handleDone,
          },
        ]}
      />
    </div>
  )
}
