import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { AlertCircle } from 'lucide-react'
import { fromPromise } from 'neverthrow'
import { useCallback, useEffect, useState } from 'react'
import { type Address, zeroAddress } from 'viem'
import { useAccount } from 'wagmi'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { MessageCard } from '@/components/ui/message-card'
import {
  type SubnameRow,
  SubnamesTable,
} from '@/features/names/components/SubnamesTable'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { getSubnamesQueryOptions } from '@/features/profile/hooks/useSubnames'
import { useDeleteSubname } from '@/features/registry/hooks/useDeleteSubname'
import { getHasRolesQueryOptions } from '@/features/registry/hooks/useHasRoles'
import { getNameRegistriesQueryOptions } from '@/features/registry/hooks/useNameRegistryDiscovery'

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
    icon={<AlertCircle size={30} strokeWidth={1.5} />}
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
            href: `/${name}/registry`,
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
  const subregistryAddress = registriesData?.[0]
  const hasSubregistry =
    subregistryAddress && subregistryAddress !== zeroAddress

  // Check if connected account has ROLE_REGISTRAR on the subregistry ROOT resource
  const { data: hasRegistrarRole } = useQuery({
    ...getHasRolesQueryOptions({
      registryAddress: subregistryAddress as Address,
      label: '',
      roles: ['ROLE_REGISTRAR'],
      account: connectedAccount as Address,
    }),
    enabled: Boolean(hasSubregistry) && Boolean(connectedAccount),
  })

  // Check if connected account has ROLE_UNREGISTER on the subregistry ROOT resource
  const { data: hasUnregisterRole } = useQuery({
    ...getHasRolesQueryOptions({
      registryAddress: subregistryAddress as Address,
      label: '',
      roles: ['ROLE_UNREGISTER'],
      account: connectedAccount as Address,
    }),
    enabled: Boolean(hasSubregistry) && Boolean(connectedAccount),
  })

  // Check if connected account can deploy a subregistry (ROLE_SET_SUBREGISTRY on parent registry)
  const parentRegistryAddress = registriesData?.[1]
  const firstLabel = name.split('.')[0]
  const { data: hasSetSubregistryRole } = useQuery({
    ...getHasRolesQueryOptions({
      registryAddress: parentRegistryAddress as Address,
      label: firstLabel,
      roles: ['ROLE_SET_SUBREGISTRY'],
      account: connectedAccount as Address,
    }),
    enabled:
      Boolean(parentRegistryAddress) &&
      Boolean(connectedAccount) &&
      !hasSubregistry,
  })

  const {
    data: subnames,
    isLoading: subnamesLoading,
    error: subnamesError,
  } = useQuery({
    ...getSubnamesQueryOptions({ name, protocolVersion: 'ENSv2' }),
    enabled: Boolean(hasSubregistry),
  })

  const {
    deleteSubnameAsync,
    isDeleting,
    error: deleteError,
  } = useDeleteSubname({
    name,
    registryAddress: (subregistryAddress as Address) ?? zeroAddress,
  })

  // Names whose delete tx is in flight — used to dim the row in the table.
  const [pendingNames, setPendingNames] = useState<readonly string[]>([])
  // Names whose delete tx already succeeded — hidden from the UI immediately
  // so the user sees the result before the indexer catches up. Cleared
  // automatically once the refreshed query no longer returns them.
  const [optimisticallyDeleted, setOptimisticallyDeleted] = useState<
    ReadonlySet<string>
  >(() => new Set())

  /**
   * Extract the first label from a full subname.
   * e.g. "cold.domico.eth" → "cold"
   */
  const getLabel = useCallback(
    (subname: string) => {
      const suffix = `.${name}`
      if (subname.endsWith(suffix)) {
        return subname.slice(0, -suffix.length)
      }
      return subname.split('.')[0]
    },
    [name],
  )

  const runDelete = useCallback(
    async (subname: SubnameRow) => {
      setPendingNames((prev) => [...prev, subname.name])
      const result = await fromPromise(
        deleteSubnameAsync({
          subname: subname.name,
          label: getLabel(subname.name),
        }),
        (error) => error as Error,
      )
      setPendingNames((prev) => prev.filter((n) => n !== subname.name))
      if (result.isOk()) {
        setOptimisticallyDeleted((prev) => {
          const next = new Set(prev)
          next.add(subname.name)
          return next
        })
      }
      return result
    },
    [deleteSubnameAsync, getLabel],
  )

  const handleDeleteSubname = useCallback(
    (subname: SubnameRow) => {
      void runDelete(subname)
    },
    [runDelete],
  )

  const handleClearSelected = useCallback(
    async (selected: SubnameRow[]) => {
      for (const subname of selected) {
        const result = await runDelete(subname)
        if (result.isErr()) break
      }
    },
    [runDelete],
  )

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

  if (subnamesError) {
    return (
      <ErrorMessage
        title="Failed to load subnames"
        description={subnamesError.cause?.message || subnamesError.message}
      />
    )
  }

  const canDeleteSubname = Boolean(hasUnregisterRole)

  const subnameRows: SubnameRow[] = (subnames || [])
    .filter((subname) => !optimisticallyDeleted.has(subname.name || ''))
    .map((subname) => ({
      name: subname.name || '',
      owner: subname.owner,
      canDelete: canDeleteSubname,
    }))

  const canCreateSubname = Boolean(hasRegistrarRole)

  return (
    <>
      <SubnamesTable
        subnames={subnameRows}
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
    </>
  )
}

interface V1SubnamesContentProps {
  readonly name: string
}

const V1SubnamesContent = ({ name }: V1SubnamesContentProps) => {
  const {
    data: subnames,
    isLoading,
    error,
  } = useQuery(getSubnamesQueryOptions({ name, protocolVersion: 'ENSv1' }))

  if (isLoading) return <LoadingMessage title="Loading subnames..." />

  if (error) {
    return (
      <ErrorMessage
        title="Failed to load subnames"
        description={error.cause?.message || error.message}
      />
    )
  }

  const subnameRows: SubnameRow[] = (subnames || []).map((subname) => ({
    name: subname.name || '',
    owner: subname.owner,
  }))

  return <SubnamesTable subnames={subnameRows} name={name} />
}

function RouteComponent() {
  const { name } = Route.useParams()

  const {
    data: ownerData,
    isLoading,
    error,
  } = useQuery(getEnsOwnerQueryOptions({ name }))

  if (error) {
    return (
      <ErrorMessage
        title="Failed to fetch name data"
        description={error.cause.message}
      />
    )
  }

  if (isLoading) {
    return <LoadingMessage title="Loading name data..." />
  }

  if (!ownerData) {
    return (
      <NotFoundMessage
        title="Name not registered"
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
