import { scopeTransactionId } from '@ens-apps/transaction-manager'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeftIcon, CircleCheck, Loader2 } from 'lucide-react'
import { type FormEvent, useMemo, useState } from 'react'
import { match } from 'ts-pattern'
import type { Address } from 'viem'
import { useConnection, usePublicClient, useWalletClient } from 'wagmi'
import { CopyButton } from '@/components/CopyButton'
import { ErrorMessage } from '@/components/ErrorMessage'
import { ListLoader } from '@/components/ListLoader/ListLoader'
import {
  infiniteFetchMore,
  useListLoader,
} from '@/components/ListLoader/useListLoader'
import { LoadingMessage } from '@/components/LoadingMessage'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { PageHeading } from '@/components/PageHeading'
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
import { getHasRolesQueryOptions } from '@/features/registry/hooks/useHasRoles'
import { ResolverCollectionNotice } from '@/features/resolver/components/ResolverCollectionNotice'
import { prepareLinkToNodeTransaction } from '@/features/resolver/helpers/linkRecords'
import { useLinkToNode } from '@/features/resolver/hooks/useLinkToNode'
import {
  getResolverNodesQueryOptions,
  getResolverOverviewQueryOptions,
  RESOLVER_NODES_PAGE_SIZE,
  type ResolverNode,
} from '@/features/resolver/hooks/useResolverOverview'
import { TransactionModal } from '@/features/transaction-manager/components/TransactionModal'
import { useFlowAttempt } from '@/features/transaction-manager/hooks/useFlowAttempt'
import { useTransactionModal } from '@/features/transaction-manager/hooks/useTransactionModal'
import { sepoliaWithEns } from '@/lib/wagmi'
import { extractErrorMessage } from '@/utils/errors/extractErrorMessage'
import { queryClient } from '@/utils/queryClient'

export const Route = createFileRoute('/resolver/$address/create-link')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
  // Started, not awaited: the page renders while the first names load.
  loader: ({ params }) => {
    void queryClient.prefetchInfiniteQuery(
      getResolverNodesQueryOptions({ address: params.address }),
    )
    void queryClient.prefetchQuery(
      getResolverOverviewQueryOptions({ address: params.address }),
    )
  },
})

interface PageHeaderProps {
  readonly address: Address
}

const PageHeader = ({ address }: PageHeaderProps) => (
  <div className="flex flex-col gap-2">
    <Link to="/resolver/$address/links" params={{ address }}>
      <Button
        variant="ghost"
        className="flex items-center gap-1 -ml-2 text-muted-foreground"
      >
        <ArrowLeftIcon className="size-6" />
        Back
      </Button>
    </Link>
    <PageHeading parent={{ type: 'resolver', address: address }}>
      Link a name
    </PageHeading>
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
      rounded="rounded-sm"
    />
    <span className="font-mono text-sm">{node.name}</span>
    <CopyButton value={node.name} />
  </div>
)

const CREATE_LINK_TX_ID = 'tx-create-link'

function RouteComponent() {
  const { address } = Route.useParams()
  const navigate = useNavigate()
  const { address: accountAddress, isConnected } = useConnection()
  const chainId = sepoliaWithEns.id
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient()

  const [fromName, setFromName] = useState<string | null>(null)
  const [toName, setToName] = useState<string | null>(null)
  const [pendingLink, setPendingLink] = useState<{
    readonly fromName: string
    readonly toName: string
  } | null>(null)
  const { closeModal, clearTransaction } = useTransactionModal()
  // Names the attempt the modal is showing, so a link abandoned mid-flight
  // can't leave a settled actor under the fixed id the next attempt looks up.
  const attempt = useFlowAttempt()
  const createLinkTxId = scopeTransactionId(CREATE_LINK_TX_ID, attempt.scope)

  const nodesQuery = useInfiniteQuery(getResolverNodesQueryOptions({ address }))
  // Only the existing links come from the overview.
  const overview = useQuery(getResolverOverviewQueryOptions({ address }))
  const resolver = overview.data

  const loadedNodes = useMemo(
    () => nodesQuery.data?.pages.flatMap((page) => page.nodes) ?? [],
    [nodesQuery.data],
  )
  const loader = useListLoader({
    initialCount: RESOLVER_NODES_PAGE_SIZE,
    loaded: loadedNodes.length,
    total: nodesQuery.data?.pages.at(-1)?.totalCount ?? undefined,
    hasMore: nodesQuery.hasNextPage,
    fetchMore: infiniteFetchMore(
      nodesQuery.fetchNextPage,
      (page) => page.nodes.length,
    ),
    resetKey: address,
  })

  const { data: hasLinkRole } = useQuery({
    ...getHasRolesQueryOptions({
      resolverAddress: address,
      roles: ['ROLE_LINK'],
      account: accountAddress as Address,
    }),
    enabled: !!accountAddress,
  })

  const canLink = Boolean(hasLinkRole)

  const nodes = loadedNodes.slice(0, loader.shown)
  const existingLinks = resolver?.links ?? []

  const nameOptions = nodes.map((n) => n.name)
  const nodeOptions = nodes
    .filter((n) => n.name !== fromName)
    .map((n) => n.name)

  const selectedFromNode = fromName
    ? (nodes.find((n) => n.name === fromName) ?? null)
    : null

  const selectedToNode = toName
    ? (nodes.find((n) => n.name === toName) ?? null)
    : null

  // Until the overview is read, whether the name is linked is unknown.
  const linksState = match(overview)
    .with({ isError: true }, () => 'unknown' as const)
    .with({ isPending: true }, () => 'loading' as const)
    .otherwise(() => 'read' as const)
  const isAlreadyLinked =
    linksState === 'read' && fromName
      ? existingLinks.some((l) => l.name === fromName)
      : false

  const mutation = useLinkToNode({
    resolverAddress: address,
    walletClient,
    publicClient,
    chainId,
    id: createLinkTxId,
  })

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!fromName || !toName) return
    mutation.reset()
    setPendingLink({ fromName, toName })
    if (accountAddress) attempt.start(accountAddress)
  }

  if (nodesQuery.isLoading) return <LoadingMessage />
  if (nodesQuery.error && !nodesQuery.isFetchNextPageError)
    return (
      <ErrorMessage
        title="Failed to load resolver"
        description={extractErrorMessage(nodesQuery.error, '')}
      />
    )

  if (loadedNodes.length === 0) {
    return (
      <div className="flex flex-col gap-6 w-full max-w-160 mx-auto">
        <PageHeader address={address} />
        <p className="text-muted-foreground">
          This resolver has no nodes. A name needs a record here before it can
          be linked to.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 w-full max-w-160 mx-auto">
      <PageHeader address={address} />

      <ResolverCollectionNotice
        collection="links"
        status={resolver?.linksStatus}
      />

      <ListLoader {...loader} />

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <Field data-invalid={isAlreadyLinked}>
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
          {selectedFromNode && (
            <div className="flex items-center gap-3 p-3 bg-muted rounded-sm">
              <NameAvatar
                name={selectedFromNode.name}
                width="40px"
                height="40px"
                rounded="rounded-sm"
              />
              <div className="flex flex-col gap-0.5 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm">
                    {selectedFromNode.name}
                  </span>
                  <CopyButton value={selectedFromNode.name} />
                </div>
                {selectedFromNode.owner?.id && (
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground truncate">
                      {selectedFromNode.owner.id}
                    </span>
                    <CopyButton value={selectedFromNode.owner.id} />
                  </div>
                )}
              </div>
            </div>
          )}
          {fromName && linksState !== 'read' && (
            <p className="text-sm text-muted-foreground">
              {linksState === 'loading'
                ? 'Checking whether this name is already linked…'
                : 'Couldn’t check whether this name is already linked. Linking again re-points it.'}
            </p>
          )}
          {isAlreadyLinked && (
            <p className="text-sm text-danger">
              {fromName} is already linked to another record. Linking again
              re-points it; the previous record is kept on the resolver.
            </p>
          )}
        </Field>

        <Field>
          <FieldLabel>Use the record of</FieldLabel>
          <Combobox value={toName} onValueChange={setToName}>
            <ComboboxInput
              placeholder="Select a name..."
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
                <ComboboxEmpty>No names available</ComboboxEmpty>
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
          {selectedToNode && (
            <div className="flex items-center gap-3 p-3 bg-muted rounded-sm">
              <NameAvatar
                name={selectedToNode.name}
                width="40px"
                height="40px"
                rounded="rounded-sm"
              />
              <div className="flex flex-col gap-0.5 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm">
                    {selectedToNode.name}
                  </span>
                  <CopyButton value={selectedToNode.name} />
                </div>
                {selectedToNode.owner?.id && (
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground truncate">
                      {selectedToNode.owner.id}
                    </span>
                    <CopyButton value={selectedToNode.owner.id} />
                  </div>
                )}
              </div>
            </div>
          )}
        </Field>

        {!isConnected && (
          <p className="text-sm text-warning">
            Please connect your wallet to link a name.
          </p>
        )}
        {isConnected && canLink === false && (
          <p className="text-sm text-danger">
            Your account does not have the ROLE_LINK permission on this
            resolver.
          </p>
        )}
        {mutation.error && (
          <p className="text-sm text-danger">{mutation.error.message}</p>
        )}

        <Button
          type="submit"
          disabled={
            !fromName ||
            !toName ||
            mutation.isPending ||
            !walletClient ||
            !isConnected ||
            !canLink
          }
          className="w-full sm:w-fit"
        >
          {mutation.isPending ? (
            <>
              <Loader2 className="size-4 animate-spin mr-2" />
              Linking...
            </>
          ) : (
            <>
              <CircleCheck className="size-4" />
              Link name
            </>
          )}
        </Button>
      </form>
      <TransactionModal
        transactions={[
          {
            id: createLinkTxId,
            title: 'Link name',
            transactionName: `Link ${pendingLink?.fromName ?? ''} to the record of ${pendingLink?.toName ?? ''}`,
            intent: {
              prepare: pendingLink
                ? ({ walletClient, chainId }) =>
                    prepareLinkToNodeTransaction({
                      sourceName: pendingLink.fromName,
                      targetName: pendingLink.toName,
                      resolverAddress: address,
                      walletClient,
                      chainId,
                    })
                : undefined,
            },
            onStart: () => {
              if (!pendingLink) return
              mutation.mutate({
                sourceName: pendingLink.fromName,
                targetName: pendingLink.toName,
              })
            },
            onDone: () => {
              closeModal()
              clearTransaction()
              attempt.end()
              setPendingLink(null)
              navigate({
                to: '/resolver/$address/links',
                params: { address },
              })
            },
          },
        ]}
      />
    </div>
  )
}
