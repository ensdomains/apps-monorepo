import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
} from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { AlertCircle } from 'lucide-react'
import { useCallback, useMemo } from 'react'
import { type Address, zeroAddress } from 'viem'
import { useAccount } from 'wagmi'
import { ErrorMessage } from '@/components/ErrorMessage'
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
import { getSubnamePagesQueryOptions } from '@/features/profile/hooks/useSubnames'
import { V1SubnamesContent } from '@/features/registry/components/V1SubnamesContent'
import { useDeleteSubname } from '@/features/registry/hooks/useDeleteSubname'
import { getHasRolesQueryOptions } from '@/features/registry/hooks/useHasRoles'
import { getNameRegistriesQueryOptions } from '@/features/registry/hooks/useNameRegistryDiscovery'
import { getNameResourceIdQueryOptions } from '@/features/registry/hooks/useNameResourceId'
import {
  getResourceRolesQueryOptions,
  holdsRolesOn,
} from '@/features/registry/hooks/useResourceRoles'
import {
  type SubnameDeleteStepSpec,
  useSubnameDeleteQueue,
} from '@/features/registry/hooks/useSubnameDeleteQueue'
import { getRegistrarAccess } from '@/features/registry/utils/create-subname.helpers'
import { prepareDeleteSubnameTransaction } from '@/features/registry/utils/delete-subname.helpers'
import { getNameRolesForAccountQueryOptions } from '@/features/roles/hooks/useNameRolesForAccount'
import { TransactionModal } from '@/features/transaction-manager/components/TransactionModal'
import type { IntentContext } from '@/features/transaction-manager/types'
import {
  ROOT_RESOURCE_ID,
  resourceIdForName,
  resourceIdFromChainValue,
} from '@/lib/resource/resourceId'
import { isRegistrable } from '@/utils/ens/tldHelpers'
import { extractErrorMessage } from '@/utils/errors/extractErrorMessage'

export const Route = createFileRoute('/$name/subnames')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
})

interface NoSubregistryMessageProps {
  readonly name: string
  readonly canDeploy: boolean
}

// The served total, less the loaded rows hidden while their delete waits on the indexer.
const withoutHidden = (total: number | undefined, hidden: number) =>
  total === undefined ? undefined : total - hidden

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

  // `register` checks the subregistry's root roles: ROLE_REGISTRAR for a free
  // label, ROLE_REGISTER_RESERVED for a reserved one. The create page asks the same.
  const { data: registrarAccess } = useQuery({
    ...getNameRolesForAccountQueryOptions({
      registryAddress: subregistryAddress as Address,
      resource: ROOT_RESOURCE_ID,
      account: connectedAccount as Address,
    }),
    select: ({ decoded }) => getRegistrarAccess(decoded),
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
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    fetchNextPage,
  } = useInfiniteQuery({
    ...getSubnamePagesQueryOptions({ name, protocolVersion: 'ENSv2' }),
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

  const servedNames = useMemo(
    () => subnames?.map((subname) => subname.name || ''),
    [subnames],
  )

  // Nothing is signed for a row whose on-chain id the indexer did not give
  // us: the label on screen is not a substitute for it (WEB-1458).
  const stepsFor = useCallback(
    (row: SubnameRow): readonly SubnameDeleteStepSpec[] => {
      const resourceId = row.resourceId
      if (!resourceId) return []
      return [
        {
          title: 'Delete subname',
          transactionName: `Delete ${row.name}`,
          // Matches the call deleteSubnameAsync submits (same registry, id and
          // chainId), so the modal's estimate stays byte-identical.
          prepare:
            hasSubregistry && subregistryAddress
              ? ({ walletClient, chainId }: IntentContext) =>
                  prepareDeleteSubnameTransaction({
                    registryAddress: subregistryAddress,
                    resourceId,
                    walletClient,
                    chainId,
                    subname: row.name,
                  })
              : undefined,
          send: (id) =>
            deleteSubnameAsync({ subname: row.name, resourceId, id }),
        },
      ]
    },
    [hasSubregistry, subregistryAddress, deleteSubnameAsync],
  )

  const {
    queue: queueForDeletion,
    transactions: deleteTransactions,
    pendingNames,
    optimisticallyDeleted,
  } = useSubnameDeleteQueue({
    connectedAccount,
    servedNames,
    stepsFor,
  })

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
          labelhash: subname.labelhash,
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
        labelhash: subname.labelhash,
        resourceId: subname.resourceId ?? undefined,
        canDelete:
          subname.resourceId !== null &&
          (hasRootUnregisterRole === true ||
            holdsRolesOn(perRowUnregisterRoles, subname.resourceId)),
      })),
    [visibleSubnames, hasRootUnregisterRole, perRowUnregisterRoles],
  )

  const handleDeleteSubname = (subname: SubnameRow) =>
    queueForDeletion([subname])

  const handleClearSelected = (selected: SubnameRow[]) =>
    queueForDeletion(selected)

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

  // A failed Load more keeps the subnames already shown.
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

  const canCreateSubname = Boolean(
    registrarAccess?.canRegister || registrarAccess?.canRegisterReserved,
  )

  return (
    <>
      <SubnamesTable
        subnames={subnameRows}
        totalCount={withoutHidden(
          subnamePages?.pages[0]?.totalCount,
          (subnames?.length ?? 0) - subnameRows.length,
        )}
        onLoadMore={hasNextPage ? () => void fetchNextPage() : undefined}
        isLoadingMore={isFetchingNextPage}
        isLoadMoreError={isFetchNextPageError}
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
