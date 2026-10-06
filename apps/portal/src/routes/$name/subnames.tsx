import {
  type FlowScope,
  scopeTransactionId,
} from '@ens-apps/transaction-manager'
import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
} from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { AlertCircle } from 'lucide-react'
import { fromPromise } from 'neverthrow'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type Address, zeroAddress } from 'viem'
import { useAccount } from 'wagmi'
import { ErrorMessage } from '@/components/ErrorMessage'
import {
  infiniteFetchMore,
  useListLoader,
} from '@/components/ListLoader/useListLoader'
import { LoadingMessage } from '@/components/LoadingMessage'
import { NameNotRegisteredMessage } from '@/components/NameNotRegisteredMessage'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { MessageCard } from '@/components/ui/message-card'
import {
  type SubnameRow,
  SubnamesTable,
} from '@/features/names/components/SubnamesTable'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { getNameAvailabilityQueryOptions } from '@/features/profile/hooks/useNameAvailability'
import {
  getV1SubnamesQueryOptions,
  getV2SubnamesQueryOptions,
  SUBNAMES_PAGE_SIZE,
  V1_SUBNAMES_PAGE_SIZE,
} from '@/features/profile/hooks/useSubnames'
import { useDeleteSubname } from '@/features/registry/hooks/useDeleteSubname'
import { getHasRolesQueryOptions } from '@/features/registry/hooks/useHasRoles'
import { getNameRegistriesQueryOptions } from '@/features/registry/hooks/useNameRegistryDiscovery'
import { getNameResourceIdQueryOptions } from '@/features/registry/hooks/useNameResourceId'
import {
  getResourceRolesQueryOptions,
  holdsRolesOn,
} from '@/features/registry/hooks/useResourceRoles'
import { prepareDeleteSubnameTransaction } from '@/features/registry/utils/delete-subname.helpers'
import { TransactionModal } from '@/features/transaction-manager/components/TransactionModal'
import { useFlowAttempt } from '@/features/transaction-manager/hooks/useFlowAttempt'
import { useTransactionModal } from '@/features/transaction-manager/hooks/useTransactionModal'
import type {
  IntentContext,
  Transaction,
} from '@/features/transaction-manager/types'
import {
  resourceIdForName,
  resourceIdFromChainValue,
} from '@/lib/resource/resourceId'
import { isRegistrable } from '@/utils/ens/tldHelpers'
import { extractErrorMessage } from '@/utils/errors/extractErrorMessage'

const DELETE_SUBNAME_TX_ID_PREFIX = 'tx-delete-ens-subname'
const deleteTxId = (subnameName: string, scope: FlowScope | null): string =>
  scopeTransactionId(`${DELETE_SUBNAME_TX_ID_PREFIX}-${subnameName}`, scope)

export const Route = createFileRoute('/$name/subnames')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
})

interface NoSubregistryMessageProps {
  readonly name: string
  readonly canDeploy: boolean
}

const NoSubregistryMessage = ({
  name,
  canDeploy,
}: NoSubregistryMessageProps) => (
  <MessageCard
    variant="warning"
    icon={<AlertCircle size={24} strokeWidth={1.5} />}
    title="No subregistry"
    description={
      <p>
        This name does not have a subregistry.
        <br />
        {canDeploy
          ? 'You must deploy one to create subnames.'
          : 'You do not have permission to deploy one.'}
      </p>
    }
    actionButton={
      canDeploy
        ? {
            label: 'Deploy subregistry',
            href: `/${encodeURIComponent(name)}/registry`,
          }
        : undefined
    }
  />
)

interface V2SubnamesContentProps {
  readonly name: string
}

const V2SubnamesContent = ({ name }: V2SubnamesContentProps) => {
  const { address: connectedAccount } = useAccount()

  const {
    data: registriesData,
    isLoading: registriesLoading,
    error: registriesError,
  } = useQuery(getNameRegistriesQueryOptions({ name }))

  // The subregistry is always the first element (index 0) in the registries array
  // For 2LD "foo.eth": [subregistry, ethRegistry, root]
  // For 3LD "sub.foo.eth": [subregistry, fooRegistry, ethRegistry, root]
  // For 4LD "x.sub.foo.eth": [subregistry, subRegistry, fooRegistry, ethRegistry, root]
  const subregistryAddress = registriesData?.[0]
  const hasSubregistry =
    subregistryAddress && subregistryAddress !== zeroAddress

  // ROLE_REGISTRAR on the subregistry's ROOT resource, which is what `register`
  // checks and where a registry-wide grant lands. Omitting `label` is what
  // selects that: a label of any kind — `''` included — asks about
  // `labelhash(label)` instead, a resource nobody is ever granted roles on, so
  // the answer was always false however the account was granted the role.
  const { data: hasRegistrarRole } = useQuery({
    ...getHasRolesQueryOptions({
      registryAddress: subregistryAddress as Address,
      roles: ['ROLE_REGISTRAR'],
      account: connectedAccount as Address,
    }),
    enabled: Boolean(hasSubregistry) && Boolean(connectedAccount),
  })

  // Check if connected account can deploy a subregistry (ROLE_SET_SUBREGISTRY on parent registry)
  const parentRegistryAddress = registriesData?.[1]
  // The name's own id, not its displayed label: a label rendered `[<64 hex>]`
  // does not say which name it is, so the id is resolved once and the gate
  // asks about that (WEB-1458). No id means no permission, never root.
  const idFromName = resourceIdForName(name).unwrapOr(null)
  const { data: readNameResourceId } = useQuery({
    ...getNameResourceIdQueryOptions({
      name,
      registryAddress: parentRegistryAddress ?? undefined,
    }),
    enabled: idFromName === null && Boolean(parentRegistryAddress),
  })
  const nameResourceId = idFromName ?? readNameResourceId ?? null
  const { data: hasSetSubregistryRole } = useQuery({
    ...getHasRolesQueryOptions({
      registryAddress: parentRegistryAddress as Address,
      resource: nameResourceId,
      roles: ['ROLE_SET_SUBREGISTRY'],
      account: connectedAccount as Address,
    }),
    enabled:
      Boolean(parentRegistryAddress) &&
      Boolean(connectedAccount) &&
      Boolean(nameResourceId) &&
      !hasSubregistry,
  })

  const {
    data: subnamePages,
    isLoading: subnamesLoading,
    error: subnamesError,
    isFetchNextPageError,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    ...getV2SubnamesQueryOptions({ name }),
    enabled: Boolean(hasSubregistry),
  })
  const subnames = useMemo(
    () => subnamePages?.pages.flatMap((page) => page.subnames),
    [subnamePages],
  )

  const {
    deleteSubnameAsync,
    isDeleting,
    error: deleteError,
  } = useDeleteSubname({
    name,
    registryAddress: (subregistryAddress as Address) ?? zeroAddress,
  })

  const {
    isOpen: isTransactionModalOpen,
    closeModal: closeTransactionModal,
    clearTransaction,
  } = useTransactionModal()

  // Names the attempt the modal is showing. A bulk delete queues several steps
  // under one attempt, so an abandoned run cannot hand its finished actors to
  // the next one and skip straight to the last subname.
  const attempt = useFlowAttempt()

  // Subnames queued for the current modal session. Length 1 for single delete
  // (inline confirm), N for bulk Clear. The modal walks through them in order.
  const [queuedDeletes, setQueuedDeletes] = useState<readonly SubnameRow[]>([])
  // Names whose delete tx is in flight — used to dim the row in the table.
  // A Set keeps adds idempotent (bulk Clear pre-marks every selected name
  // before runDelete fires, and runDelete also self-marks).
  const [pendingNames, setPendingNames] = useState<ReadonlySet<string>>(
    () => new Set(),
  )
  // Names whose delete tx already succeeded — hidden from the UI immediately
  // so the user sees the result before the indexer catches up. Cleared
  // automatically once the refreshed query no longer returns them.
  const [optimisticallyDeleted, setOptimisticallyDeleted] = useState<
    ReadonlySet<string>
  >(() => new Set())

  // Every row keeps the id the indexer holds for it. That id — not the label
  // rendered in the cell — is what the delete call and the permission check
  // are both asked about, so the row on screen and the resource in the
  // calldata can never be two different names (WEB-1458). A row whose id the
  // indexer could not give us is shown, but cannot be selected for deletion.
  const visibleSubnames = useMemo(
    () =>
      (subnames ?? [])
        .map((subname) => ({
          name: subname.name || '',
          owner: subname.owner,
          resourceId: resourceIdFromChainValue(subname.labelhash).unwrapOr(
            null,
          ),
        }))
        .filter((subname) => !optimisticallyDeleted.has(subname.name)),
    [subnames, optimisticallyDeleted],
  )

  // `unregister` checks ROLE_UNREGISTER on the subname's own resource, so the
  // Delete control is gated per row rather than once on the registry's root.
  //
  // The registry ORs the caller's root roles into every resource, so the root
  // question is asked first: it is one read on a key that does not change as
  // rows come and go, and a `true` settles every row without a second call.
  // Only when it is `false` is the per-row question worth asking.
  const { data: hasRootUnregisterRole, isPending: isRootUnregisterPending } =
    useQuery({
      ...getHasRolesQueryOptions({
        registryAddress: subregistryAddress as Address,
        roles: ['ROLE_UNREGISTER'],
        account: connectedAccount as Address,
      }),
      enabled: Boolean(hasSubregistry) && Boolean(connectedAccount),
    })

  const unregisterResources = useMemo(
    () =>
      visibleSubnames.flatMap((subname) =>
        subname.resourceId ? [subname.resourceId.toString()] : [],
      ),
    [visibleSubnames],
  )

  const { data: perRowUnregisterRoles } = useQuery({
    ...getResourceRolesQueryOptions({
      registryAddress: (subregistryAddress as Address) ?? zeroAddress,
      account: connectedAccount as Address,
      roles: ['ROLE_UNREGISTER'],
      resources: unregisterResources,
    }),
    enabled:
      Boolean(hasSubregistry) &&
      Boolean(connectedAccount) &&
      !isRootUnregisterPending &&
      hasRootUnregisterRole === false &&
      unregisterResources.length > 0,
    // The key carries the row list, so deleting or indexing a row makes a new
    // key. Without this the answers would blank out and the delete controls
    // would disappear for a round trip in the middle of a bulk delete.
    placeholderData: keepPreviousData,
  })

  // The rows the table renders. Built here, not below the early returns, so
  // the array identity is stable across renders — `useReactTable` re-runs its
  // row models whenever `data` changes identity.
  const subnameRows: readonly SubnameRow[] = useMemo(
    () =>
      visibleSubnames.map((subname) => ({
        name: subname.name,
        owner: subname.owner,
        resourceId: subname.resourceId ?? undefined,
        canDelete:
          subname.resourceId !== null &&
          (hasRootUnregisterRole === true ||
            holdsRolesOn(perRowUnregisterRoles, subname.resourceId)),
      })),
    [visibleSubnames, hasRootUnregisterRole, perRowUnregisterRoles],
  )

  // Counted in visible rows: a row hidden while its delete waits on the
  // indexer is neither shown nor part of the total.
  const totalCount = subnamePages?.pages[0]?.totalCount
  const loader = useListLoader({
    initialCount: SUBNAMES_PAGE_SIZE,
    loaded: subnameRows.length,
    total:
      totalCount === undefined
        ? undefined
        : totalCount - ((subnames?.length ?? 0) - subnameRows.length),
    hasMore: hasNextPage,
    fetchMore: infiniteFetchMore(
      fetchNextPage,
      (page) =>
        page.subnames.filter(
          (subname) => !optimisticallyDeleted.has(subname.name || ''),
        ).length,
    ),
    resetKey: name,
  })
  const shownRows = useMemo(
    () => subnameRows.slice(0, loader.shown),
    [subnameRows, loader.shown],
  )

  // Tracks names whose deleteSubnameAsync mutation is currently in flight.
  // Prevents double-submission when both the modal's auto-advance onDone
  // and the user's "Open wallet" click attempt to fire the same tx for the
  // same subname — the second runDelete call is a no-op until the first
  // settles.
  const inFlightRef = useRef<Set<string>>(new Set())

  const runDelete = useCallback(
    async (subname: SubnameRow, id: string) => {
      if (inFlightRef.current.has(subname.name)) return
      // Nothing is signed for a row whose on-chain id the indexer did not give
      // us: the label on screen is not a substitute for it (WEB-1458).
      if (!subname.resourceId) return
      inFlightRef.current.add(subname.name)

      setPendingNames((prev) => {
        if (prev.has(subname.name)) return prev
        const next = new Set(prev)
        next.add(subname.name)
        return next
      })

      const result = await fromPromise(
        deleteSubnameAsync({
          subname: subname.name,
          resourceId: subname.resourceId,
          id,
        }),
        (error) => error as Error,
      )

      setPendingNames((prev) => {
        if (!prev.has(subname.name)) return prev
        const next = new Set(prev)
        next.delete(subname.name)
        return next
      })
      if (result.isOk()) {
        setOptimisticallyDeleted((prev) => {
          const next = new Set(prev)
          next.add(subname.name)
          return next
        })
      }
      inFlightRef.current.delete(subname.name)
    },
    [deleteSubnameAsync],
  )

  const queueForDeletion = useCallback(
    (rows: readonly SubnameRow[]) => {
      // Rows without an id are never signed for, so they are never queued
      // either — queuing them would only show a step that cannot run.
      const deletable = rows.filter((row) => Boolean(row.resourceId))
      if (deletable.length === 0) return
      setQueuedDeletes(deletable)
      // Pre-mark every queued name as pending so all rows dim immediately,
      // not just the one currently being signed. runDelete pops each name
      // off as its tx settles; the close-cleanup effect handles abandons.
      setPendingNames((prev) => {
        const next = new Set(prev)
        for (const r of deletable) next.add(r.name)
        return next
      })
      if (connectedAccount) attempt.start(connectedAccount)
    },
    [attempt, connectedAccount],
  )

  const handleDeleteSubname = (subname: SubnameRow) =>
    queueForDeletion([subname])

  const handleClearSelected = (selected: SubnameRow[]) =>
    queueForDeletion(selected)

  // The prepared delete transaction for a queued subname — deterministic given
  // the registry and the row's id, so the modal can estimate gas the moment it
  // opens. Matches the call submitted by runDelete → useDeleteSubname (same
  // registry, id and chainId) so the estimate stays byte-identical. Yields a
  // lazy thunk (or undefined when there's no subregistry, or no id for the row)
  // the modal calls with the ready wallet context.
  const getDeleteIntent = (subname: SubnameRow) => {
    const resourceId = subname.resourceId
    if (!hasSubregistry || !subregistryAddress || !resourceId) return undefined
    return ({ walletClient, chainId }: IntentContext) =>
      prepareDeleteSubnameTransaction({
        registryAddress: subregistryAddress,
        resourceId,
        walletClient,
        chainId,
        subname: subname.name,
      })
  }

  // One Transaction entry per queued subname. The modal walks through them
  // top-to-bottom; intermediate onDone fires the next one's onStart so the
  // user gets sequential wallet popups without having to click "Next" between
  // each. Last onDone wraps up the modal session.
  const deleteTransactions: readonly Transaction[] = queuedDeletes.map(
    (subname, i) => {
      const id = deleteTxId(subname.name, attempt.scope)
      const isLast = i === queuedDeletes.length - 1
      const next = queuedDeletes[i + 1]
      return {
        id,
        title: 'Delete subname',
        transactionName: `Delete ${subname.name}`,
        intent: { prepare: getDeleteIntent(subname) },
        onStart: () => {
          void runDelete(subname, id)
        },
        onDone: isLast
          ? () => {
              closeTransactionModal()
              clearTransaction()
              attempt.end()
              setQueuedDeletes([])
            }
          : () => {
              void runDelete(next, deleteTxId(next.name, attempt.scope))
            },
      }
    },
  )

  // When the modal closes (success path or user dismissal), reset the queue
  // and drop any pre-marked names that haven't actually started — runDelete
  // is the source of truth for in-flight names, and it manages its own entry.
  useEffect(() => {
    if (isTransactionModalOpen) return
    if (queuedDeletes.length === 0) return
    const queuedNames = new Set(queuedDeletes.map((r) => r.name))
    setQueuedDeletes([])
    setPendingNames((prev) => {
      let changed = false
      const next = new Set(prev)
      for (const n of queuedNames) {
        if (next.delete(n)) changed = true
      }
      return changed ? next : prev
    })
  }, [isTransactionModalOpen, queuedDeletes])

  // Once the indexer has caught up and stopped returning a name we
  // optimistically deleted, drop it from the set — the row is naturally
  // absent from the query data, so the local override is no longer needed.
  useEffect(() => {
    if (!subnames) return
    const present = new Set(subnames.map((s) => s.name || ''))
    setOptimisticallyDeleted((prev) => {
      const next = new Set<string>()
      for (const n of prev) if (present.has(n)) next.add(n)
      return next.size === prev.size ? prev : next
    })
  }, [subnames])

  if (registriesLoading) {
    return <LoadingMessage title="Checking registry..." />
  }

  if (registriesError) {
    return (
      <ErrorMessage
        title="Failed to load registry"
        description={registriesError.cause?.message || registriesError.message}
      />
    )
  }

  if (!hasSubregistry) {
    return (
      <NoSubregistryMessage
        name={name}
        canDeploy={Boolean(hasSetSubregistryRole)}
      />
    )
  }

  if (subnamesLoading) {
    return <LoadingMessage title="Loading subnames..." />
  }

  if (subnamesError && !isFetchNextPageError) {
    return (
      <ErrorMessage
        title="Failed to load subnames"
        description={extractErrorMessage(subnamesError, '')}
      />
    )
  }

  // Whether the delete affordances exist at all. Driven by the stable root
  // answer where possible, so the select column and Clear button do not come
  // and go as the per-row answers refetch.
  const canDeleteSubname =
    hasRootUnregisterRole === true || subnameRows.some((row) => row.canDelete)

  const canCreateSubname = Boolean(hasRegistrarRole)

  return (
    <>
      <SubnamesTable
        subnames={shownRows}
        loader={loader}
        name={name}
        canCreateSubname={canCreateSubname}
        onDeleteSubname={canDeleteSubname ? handleDeleteSubname : undefined}
        onClearSelected={canDeleteSubname ? handleClearSelected : undefined}
        isDeleting={isDeleting}
        pendingNames={pendingNames}
      />
      {deleteError && (
        <ErrorMessage
          title="Failed to delete subname"
          description={deleteError.message}
        />
      )}
      {deleteTransactions.length > 0 && (
        <TransactionModal transactions={deleteTransactions} />
      )}
    </>
  )
}

interface V1SubnamesContentProps {
  readonly name: string
}

const V1SubnamesContent = ({ name }: V1SubnamesContentProps) => {
  const {
    data,
    isLoading,
    error,
    isFetchNextPageError,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery(getV1SubnamesQueryOptions({ name }))
  const subnameRows = useMemo(
    () =>
      data?.pages.flatMap((page) =>
        page.subnames.map((subname) => ({
          name: subname.name || '',
          owner: subname.owner,
        })),
      ) ?? [],
    [data],
  )

  const loader = useListLoader({
    initialCount: V1_SUBNAMES_PAGE_SIZE,
    loaded: subnameRows.length,
    hasMore: hasNextPage,
    fetchMore: infiniteFetchMore(fetchNextPage, (page) => page.subnames.length),
    resetKey: name,
  })
  const shownRows = useMemo(
    () => subnameRows.slice(0, loader.shown),
    [subnameRows, loader.shown],
  )

  if (isLoading) return <LoadingMessage title="Loading subnames..." />

  if (error && !isFetchNextPageError) {
    return (
      <ErrorMessage
        title="Failed to load subnames"
        description={extractErrorMessage(error, '')}
      />
    )
  }

  return <SubnamesTable subnames={shownRows} loader={loader} name={name} />
}

function RouteComponent() {
  const { name } = Route.useParams()

  const {
    data: ownerData,
    isLoading,
    error,
  } = useQuery(getEnsOwnerQueryOptions({ name }))

  // The v2 registry keeps returning the previous owner (latestOwner) after
  // expiry, so registration is read from the registrar's availability (true
  // only past grace) rather than owner presence.
  const availabilityQuery = useQuery({
    ...getNameAvailabilityQueryOptions({ name }),
    enabled: isRegistrable(name),
  })

  if (error) {
    return (
      <ErrorMessage
        title="Failed to fetch name data"
        description={error.cause.message}
      />
    )
  }

  if (isLoading || (availabilityQuery.isLoading && isRegistrable(name))) {
    return <LoadingMessage title="Loading name data..." />
  }

  if (availabilityQuery.error) {
    return (
      <ErrorMessage
        title="Error checking availability"
        description={
          availabilityQuery.error.cause?.message ||
          availabilityQuery.error.message
        }
      />
    )
  }

  if (availabilityQuery.data?.isAvailable || !ownerData) {
    return (
      <NameNotRegisteredMessage
        name={name}
        description={
          <>
            <strong>{name}</strong> is not registered, so there are no subnames
            to display.
          </>
        }
      />
    )
  }

  // V1 names - show their subnames
  if (ownerData.protocolVersion === 'ENSv1') {
    return <V1SubnamesContent name={name} />
  }

  // V2 names
  return <V2SubnamesContent name={name} />
}
