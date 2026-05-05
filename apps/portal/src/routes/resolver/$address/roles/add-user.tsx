import type { ResolverRole } from '@ensdomains/ensjs/public/v2'
import { useMutation, useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeftIcon, Loader2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { type Address, isAddress } from 'viem'
import { usePublicClient, useWalletClient } from 'wagmi'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import { NotFoundMessage } from '@/components/NotFoundMessage'
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
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NameAvatar } from '@/features/profile/components/NameAvatar'
import { useGrantResolverRoles } from '@/features/resolver/hooks/useGrantResolverRoles'
import { getResolverOverviewQueryOptions } from '@/features/resolver/hooks/useResolverOverview'
import { resolveAddressOrName } from '@/features/roles/helpers/addUser.handlers'
import { TransactionModal } from '@/features/transaction-manager/components/TransactionModal'
import { useTransactionModal } from '@/features/transaction-manager/hooks/useTransactionModal'
import { resolverPermissions } from '@/lib/roles/resolverRoles'
import { sepoliaWithEns } from '@/lib/wagmi'
import { truncateAddress } from '@/utils/formatting/truncateAddress'

export const Route = createFileRoute('/resolver/$address/roles/add-user')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
})

const ROOT_NODE_VALUE = ''

function RouteComponent() {
  const GRANT_RESOLVER_ROLES_TX_ID = 'tx-grant-resolver-roles'
  const { address } = Route.useParams()
  const navigate = useNavigate()
  const chainId = sepoliaWithEns.id
  const { data: walletClient } = useWalletClient({ chainId })
  const publicClient = usePublicClient({ chainId })

  const [userInput, setUserInput] = useState('')
  const resolveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Node to grant roles on (empty string = root / all nodes)
  const [selectedNode, setSelectedNode] = useState<string>(ROOT_NODE_VALUE)
  const [selectedRoles, setSelectedRoles] = useState<ResolverRole[]>([])
  const [pendingRoleGrant, setPendingRoleGrant] = useState<{
    readonly name: string
    readonly account: Address
    readonly roles: ResolverRole[]
  } | null>(null)
  const { openModal, closeModal, clearTransaction } = useTransactionModal()

  const resolveMutation = useMutation({
    mutationFn: async ({ nameOrAddress }: { nameOrAddress: string }) => {
      if (!publicClient) {
        throw new Error('Public client not available')
      }
      const resolved = await resolveAddressOrName({
        client: publicClient,
        nameOrAddress,
      })
      if (!resolved)
        throw new Error(`Could not resolve address for ${nameOrAddress}`)
      return resolved
    },
  })

  const userAddress: Address | null = isAddress(userInput)
    ? userInput
    : (resolveMutation.data ?? null)

  const {
    data: resolver,
    isLoading,
    error,
  } = useQuery(getResolverOverviewQueryOptions({ address: address as Address }))

  const mutation = useGrantResolverRoles({
    resolverAddress: address as Address,
    walletClient,
    publicClient,
    chainId,
    id: GRANT_RESOLVER_ROLES_TX_ID,
    onSuccess: () =>
      navigate({ to: '/resolver/$address/roles', params: { address } }),
  })

  if (isLoading) return <LoadingMessage />

  if (error)
    return (
      <ErrorMessage
        title="Failed to load resolver"
        description={error.cause?.message}
      />
    )
  if (!walletClient?.account) return <div>Not connected.</div>

  const nodes = resolver?.nodes ?? []
  const nameOptions = nodes.map((n) => n.name).filter(Boolean)

  const handleUserInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setUserInput(value)
    resolveMutation.reset()

    if (resolveTimeoutRef.current) clearTimeout(resolveTimeoutRef.current)
    if (!value || isAddress(value) || !value.includes('.')) return

    resolveTimeoutRef.current = setTimeout(() => {
      resolveMutation.mutate({ nameOrAddress: value })
    }, 500)
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!userAddress) return

    if (selectedRoles.length > 0) {
      mutation.reset()
      setPendingRoleGrant({
        name: selectedNode,
        account: userAddress,
        roles: selectedRoles,
      })
      openModal()
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4 w-full lg:max-w-2xl xl:max-w-5xl mx-auto">
      <Link to="/resolver/$address/roles" params={{ address }}>
        <Button variant="ghost" className="flex items-center gap-2 -ml-2">
          <ArrowLeftIcon className="size-4" />
          Back
        </Button>
      </Link>

      <h1 className="text-heading font-medium leading-none">Add user</h1>

      <div className="flex flex-col gap-6">
        {/* User input */}
        <Field>
          <FieldLabel>User</FieldLabel>
          <Input
            placeholder="ENS name or HEX address"
            value={userInput}
            onChange={handleUserInputChange}
          />
          {resolveMutation.isPending && (
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <Loader2 className="size-3 animate-spin" />
              Resolving...
            </p>
          )}
          {userAddress &&
            !isAddress(userInput) &&
            !resolveMutation.isPending && (
              <p className="text-sm text-muted-foreground">
                Resolved: {truncateAddress(userAddress)}
              </p>
            )}
          {resolveMutation.error && (
            <p className="text-sm text-danger">
              {resolveMutation.error.message}
            </p>
          )}
        </Field>

        {/* Node dropdown */}
        <Field>
          <FieldLabel>Node</FieldLabel>
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
                            {node.owner.id.slice(0, 6)}...
                            {node.owner.id.slice(-4)}
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

        {/* Roles */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <h2 className="text-lg font-medium">Roles</h2>
          <div className="border rounded-sm divide-y">
            {resolverPermissions.map((permission) => {
              const role = permission.key as ResolverRole
              const isChecked = selectedRoles.includes(role)

              return (
                <div
                  key={permission.key}
                  className="flex items-center justify-between p-4 gap-4"
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
                        id={permission.key}
                        checked={isChecked}
                        onCheckedChange={(checked) => {
                          setSelectedRoles((prev) => {
                            if (checked)
                              return prev.includes(role)
                                ? prev
                                : [...prev, role]
                            return prev.filter((r) => r !== role)
                          })
                        }}
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
                        id={`${permission.key}_ADMIN`}
                        name={`${permission.key}_ADMIN`}
                        disabled
                      />
                      <Label
                        htmlFor={`${permission.key}_ADMIN`}
                        className="font-normal cursor-pointer text-muted-foreground opacity-50"
                      >
                        Admin
                      </Label>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <Button
            type="submit"
            variant="default"
            className="w-fit"
            disabled={
              !userAddress || selectedRoles.length === 0 || mutation.isPending
            }
          >
            {mutation.isPending ? 'Saving...' : 'Save roles'}
          </Button>

          {mutation.error && (
            <ErrorMessage
              description={mutation.error.message}
              title={mutation.error.name}
            />
          )}
        </form>
      </div>
      <TransactionModal
        transactions={[
          {
            id: GRANT_RESOLVER_ROLES_TX_ID,
            title: 'Grant resolver roles',
            transactionName: `Grant resolver roles for ${pendingRoleGrant?.name || '(root)'}`,
            estimatedGasCost: 0.0001,
            onStart: () => {
              if (!pendingRoleGrant) return
              mutation.mutate(pendingRoleGrant)
            },
            onDone: () => {
              closeModal()
              clearTransaction()
              setPendingRoleGrant(null)
            },
          },
        ]}
      />
    </div>
  )
}
