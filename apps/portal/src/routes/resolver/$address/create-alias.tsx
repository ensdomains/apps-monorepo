import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeftIcon, Loader2 } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { match, P } from 'ts-pattern'
import type { Address } from 'viem'
import { useConnection, usePublicClient, useWalletClient } from 'wagmi'
import { CopyButton } from '@/components/CopyButton'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { Button } from '@/components/ui/button'
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox'
import { Field, FieldLabel } from '@/components/ui/field'
import { NameAvatar } from '@/features/profile/components/NameAvatar'
import { createEOASigner } from '@/features/registry/utils/signer.helpers'
import { setAlias } from '@/features/resolver/helpers/setAlias'
import {
  getResolverOverviewQueryOptions,
  type ResolverNode,
} from '@/features/resolver/hooks/useResolverOverview'
import { namechainSepolia } from '@/lib/wagmi'
import { pollForIndexerSync } from '@/utils/query/pollForIndexerSync'
import { queryClient } from '@/utils/queryClient'

export const Route = createFileRoute('/resolver/$address/create-alias')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
  loader: ({ params }) => {
    return queryClient.prefetchQuery(
      getResolverOverviewQueryOptions({
        address: params.address as Address,
      }),
    )
  },
})

interface PageHeaderProps {
  readonly address: string
}

const PageHeader = ({ address }: PageHeaderProps) => (
  <div className="flex flex-col gap-2">
    <Link to="/resolver/$address/aliases" params={{ address }}>
      <Button
        variant="ghost"
        className="flex items-center gap-1 -ml-2 text-quartz-500"
      >
        <ArrowLeftIcon className="size-6" />
        Back
      </Button>
    </Link>
    <h1 className="text-[30px] font-medium leading-[1.35]">Create alias</h1>
  </div>
)

interface NodeOptionProps {
  readonly node: ResolverNode
}

const NodeOption = ({ node }: NodeOptionProps) => (
  <div className="flex items-center gap-3">
    <NameAvatar
      name={node.name}
      width="28px"
      height="28px"
      rounded="rounded-full"
    />
    <span className="font-mono text-sm">{node.name}</span>
    <CopyButton value={node.name} />
  </div>
)

function RouteComponent() {
  const { address } = Route.useParams()
  const navigate = useNavigate()
  const { isConnected } = useConnection()
  const chainId = namechainSepolia.id
  const { data: walletClient } = useWalletClient({ chainId })
  const publicClient = usePublicClient({ chainId })

  const [fromName, setFromName] = useState<string | null>(null)
  const [toName, setToName] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const {
    data: resolver,
    isLoading,
    error,
  } = useQuery(getResolverOverviewQueryOptions({ address: address as Address }))

  const nodes = resolver?.nodes ?? []
  const existingAliases = resolver?.aliases ?? []

  const nameOptions = nodes.map((n) => n.name)
  const nodeOptions = nodes
    .filter((n) => n.name !== fromName)
    .map((n) => n.name)

  const isAlreadyAliased = fromName
    ? existingAliases.some((a) => a.fromName === fromName)
    : false

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!fromName || !toName || !walletClient || !publicClient) return

    setIsSubmitting(true)
    setSubmitError(null)

    try {
      const signer = createEOASigner(walletClient)
      await setAlias({
        fromName,
        toName,
        resolverAddress: address as Address,
        walletClient,
        publicClient,
        signer,
        chainId,
      })
      await pollForIndexerSync({
        invalidateQueries: () =>
          queryClient.invalidateQueries({
            queryKey: ['resolver-overview'],
            refetchType: 'all',
          }),
      })
      navigate({ to: '/resolver/$address/aliases', params: { address } })
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Transaction failed')
      setIsSubmitting(false)
    }
  }

  if (isLoading) return <LoadingMessage title="Loading resolver data" />
  if (error)
    return (
      <ErrorMessage
        title="Failed to load resolver"
        description={error.cause?.message}
      />
    )

  if (nodes.length === 0) {
    return (
      <div className="flex flex-col gap-6 px-4 py-4 sm:py-6 w-full max-w-[640px] mx-auto">
        <PageHeader address={address} />
        <p className="text-quartz-500">
          This resolver has no nodes. A node must exist before an alias can be
          created.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 px-4 py-4 sm:py-6 w-full max-w-[640px] mx-auto">
      <PageHeader address={address} />

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <Field data-invalid={isAlreadyAliased}>
          <FieldLabel>Name</FieldLabel>
          <Combobox
            value={fromName}
            onValueChange={(val) => {
              setFromName(val)
              if (val === toName) setToName(null)
            }}
          >
            <ComboboxInput placeholder="Select a name..." />
            <ComboboxContent>
              <ComboboxList>
                {nameOptions.map((name) => (
                  <ComboboxItem key={name} value={name}>
                    <NodeOption
                      node={nodes.find((n) => n.name === name) as ResolverNode}
                    />
                  </ComboboxItem>
                ))}
                <ComboboxEmpty>No names found</ComboboxEmpty>
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
          {fromName &&
            (() => {
              const selectedNode = nodes.find((n) => n.name === fromName)
              return (
                <div className="flex items-center gap-3 p-3 bg-quartz-50 rounded-lg">
                  <NameAvatar
                    name={fromName}
                    width="40px"
                    height="40px"
                    rounded="rounded-full"
                  />
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm">{fromName}</span>
                      <CopyButton value={fromName} />
                    </div>
                    {selectedNode?.owner?.id && (
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground truncate">
                          {selectedNode.owner.id}
                        </span>
                        <CopyButton value={selectedNode.owner.id} />
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}
          {isAlreadyAliased && (
            <p className="text-sm text-danger">
              {fromName} already has an alias. Creating a new one will overwrite
              the existing alias.
            </p>
          )}
        </Field>

        <Field>
          <FieldLabel>Node to use</FieldLabel>
          <Combobox value={toName} onValueChange={setToName}>
            <ComboboxInput
              placeholder="Select a node..."
              disabled={!fromName}
            />
            <ComboboxContent>
              <ComboboxList>
                {nodeOptions.map((name) => (
                  <ComboboxItem key={name} value={name}>
                    <NodeOption
                      node={nodes.find((n) => n.name === name) as ResolverNode}
                    />
                  </ComboboxItem>
                ))}
                <ComboboxEmpty>No nodes available</ComboboxEmpty>
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
          {toName && (
            <div className="flex items-center gap-3 p-3 bg-quartz-50 rounded-lg">
              <NameAvatar
                name={toName}
                width="40px"
                height="40px"
                rounded="rounded-full"
              />
              <span className="font-mono text-sm">{toName}</span>
              <CopyButton value={toName} />
            </div>
          )}
        </Field>

        {match({ isConnected, submitError })
          .with({ isConnected: false }, () => (
            <p className="text-sm text-warning">
              Please connect your wallet to create an alias.
            </p>
          ))
          .with(
            { submitError: P.string.minLength(1) },
            ({ submitError: err }) => (
              <p className="text-sm text-danger">{err}</p>
            ),
          )
          .otherwise(() => null)}

        <Button
          type="submit"
          disabled={
            !fromName ||
            !toName ||
            isSubmitting ||
            !walletClient ||
            !isConnected
          }
          className="w-full sm:w-fit"
        >
          {match(isSubmitting)
            .with(true, () => (
              <>
                <Loader2 className="size-4 animate-spin mr-2" />
                Creating...
              </>
            ))
            .otherwise(() => 'Create alias')}
        </Button>
      </form>
    </div>
  )
}
