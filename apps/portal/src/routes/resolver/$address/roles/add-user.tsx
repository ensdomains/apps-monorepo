import type { ResolverRole } from '@ensdomains/ensjs/public/v2'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeftIcon } from 'lucide-react'
import { useState } from 'react'
import type { Address } from 'viem'
import { useWalletClient } from 'wagmi'
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
import { Label } from '@/components/ui/label'
import { NameAvatar } from '@/features/profile/components/NameAvatar'
import { useGrantResolverRoles } from '@/features/resolver/hooks/useGrantResolverRoles'
import { getResolverOverviewQueryOptions } from '@/features/resolver/hooks/useResolverOverview'
import { resolverPermissions } from '@/lib/roles/resolverRoles'
import { namechainSepolia } from '@/lib/wagmi'

export const Route = createFileRoute('/resolver/$address/roles/add-user')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
})

function RouteComponent() {
  const { address } = Route.useParams()
  const navigate = useNavigate()
  const chainId = namechainSepolia.id
  const { data: walletClient } = useWalletClient({ chainId })

  const [selectedName, setSelectedName] = useState<string | null>(null)

  const {
    data: resolver,
    isLoading,
    error,
  } = useQuery(getResolverOverviewQueryOptions({ address: address as Address }))

  const mutation = useGrantResolverRoles({
    resolverAddress: address as Address,
    walletClient,
    onSuccess: () =>
      navigate({ to: '/resolver/$address/roles', params: { address } }),
  })

  if (isLoading) return <LoadingMessage title="Loading resolver data" />
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
  const selectedNode = nodes.find((n) => n.name === selectedName)
  const ownerAddress = selectedNode?.owner?.id as Address | undefined

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!e.currentTarget.reportValidity()) return

    const fd = new FormData(e.currentTarget)
    const roles: ResolverRole[] = []

    for (const [k, v] of fd.entries()) {
      if (v === 'on') {
        roles.push(k as ResolverRole)
      }
    }

    if (ownerAddress && selectedName && roles.length > 0) {
      mutation.reset()
      mutation.mutate({ name: selectedName, account: ownerAddress, roles })
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
        <Field>
          <FieldLabel>Name</FieldLabel>
          <Combobox value={selectedName} onValueChange={setSelectedName}>
            <ComboboxInput placeholder="Select a name..." />
            <ComboboxContent>
              <ComboboxList>
                {nameOptions.map((name) => {
                  const node = nodes.find((n) => n.name === name)
                  return (
                    <ComboboxItem key={name} value={name}>
                      <div className="flex items-center gap-2">
                        <NameAvatar
                          name={name}
                          width="24px"
                          height="24px"
                          rounded="rounded-full"
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
          {ownerAddress && (
            <p className="text-sm text-muted-foreground">
              Owner: {ownerAddress.slice(0, 6)}...{ownerAddress.slice(-4)}
            </p>
          )}
        </Field>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <h2 className="text-lg font-medium">Roles</h2>
          <div className="border rounded-lg divide-y">
            {resolverPermissions.map((permission) => (
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
                    <Checkbox name={permission.key} id={permission.key} />
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
                      disabled
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
            ))}
          </div>
          <Button
            type="submit"
            variant="secondary"
            className="w-fit"
            disabled={!ownerAddress || !selectedName || mutation.isPending}
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
    </div>
  )
}
