import { useIsFetching, useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { match } from 'ts-pattern'
import { zeroAddress } from 'viem'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useHasSetSubregistryRole } from '@/features/registry/hooks/useHasSetSubregistryRole'
import { getNameRegistriesQueryOptions } from '@/features/registry/hooks/useNameRegistryDiscovery'
import { getNameResourceIdQueryOptions } from '@/features/registry/hooks/useNameResourceId'
import { useSubregistryWriteGuard } from '@/features/registry/hooks/useSubregistryWriteGuard'
import { resourceIdForName } from '@/lib/resource/resourceId'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import { RegistryPanel } from './RegistryPanel'
import { SubregistryConfigurator } from './SubregistryConfigurator'

type ConfigureRegistryFormProps = {
  name: string
}

export const ConfigureRegistryForm = ({ name }: ConfigureRegistryFormProps) => {
  const { hasRole, isLoading, error, parentRegistry, connectedAddress } =
    useHasSetSubregistryRole(name)

  // The id the write will use, so the guard proves the slot that id names is
  // empty rather than a slot derived from the displayed label (WEB-1458).
  const idFromName = resourceIdForName(name).unwrapOr(null)
  const { data: readId } = useQuery({
    ...getNameResourceIdQueryOptions({
      name,
      registryAddress: parentRegistry ?? undefined,
    }),
    enabled: idFromName === null && Boolean(parentRegistry),
  })

  const [showForm, setShowForm] = useState(false)
  const { writeBlock, assertUnset } = useSubregistryWriteGuard({
    name,
    parentRegistry,
    resourceId: idFromName ?? readId ?? null,
  })
  const isRefetchingRegistries =
    useIsFetching({
      queryKey: getNameRegistriesQueryOptions({ name }).queryKey,
    }) > 0

  if (isLoading) {
    return <LoadingSpinner title="Checking permissions..." />
  }

  if (error) {
    return (
      <ErrorMessage
        compact
        description="Error fetching registry data. Please refresh the page."
      />
    )
  }

  if (!parentRegistry || parentRegistry === zeroAddress) return null

  if (!connectedAddress) {
    return (
      <ErrorMessage
        title="Wallet Not Connected"
        description="Please connect your wallet to deploy or change a registry."
      />
    )
  }

  // The name gained a registry while this form was open, so there is nothing
  // left to configure — only something to destroy. The guard's toast carries
  // the explanation; while the refreshed discovery query is on its way to swap
  // this form for the configured view, show that transition instead of a
  // refusal that would only flash.
  if (writeBlock?.kind === 'conflict' && isRefetchingRegistries) {
    return (
      <LoadingSpinner title="Loading the registry configured for this name..." />
    )
  }

  // The refetch settled and still reports no registry (a lagging RPC node), so
  // the swap isn't coming: keep the refusal on screen.
  if (writeBlock?.kind === 'conflict') {
    return (
      <RegistryPanel>
        <ErrorMessage
          title="Registry already configured"
          description={
            <>
              <strong>{name}</strong> now uses the registry at{' '}
              <strong>{truncateAddress(writeBlock.subregistry, 6, 4)}</strong>,
              configured since this page was loaded. Pointing it at a different
              registry would detach that one and every subname it holds, so this
              form was stopped. Refresh to manage the registry it has.
            </>
          }
        />
      </RegistryPanel>
    )
  }

  return (
    <RegistryPanel>
      <Alert className="p-5 gap-2" variant="neutral">
        <AlertTitle>No registry configured</AlertTitle>
        <AlertDescription>
          <p>
            This name doesn't have a contract set to create and manage subnames.
            Create one to turn <strong>{name}</strong> into its own namespace
            with subnames like <strong>cold.{name}</strong> or{' '}
            <strong>agent.{name}</strong>.
          </p>
        </AlertDescription>
      </Alert>
      {match({ hasRole, showForm })
        .with({ hasRole: false }, () => (
          <div className="flex flex-col gap-2">
            <Button className="w-full" variant="default" disabled>
              <Plus className="size-3" />
              Configure registry
            </Button>
            <p className="text-p text-muted-foreground">
              You need the{' '}
              <strong className="text-foreground">Set Subregistry</strong> role
              to configure this registry. Ask an admin to grant it.
            </p>
          </div>
        ))
        .with({ showForm: true }, () => (
          <SubregistryConfigurator
            name={name}
            onCancel={() => setShowForm(false)}
            assertWritable={assertUnset}
          />
        ))
        .otherwise(() => (
          <Button
            className="w-full"
            variant="default"
            onClick={() => setShowForm(true)}
          >
            <Plus className="size-3" />
            Configure registry
          </Button>
        ))}
      {writeBlock?.kind === 'unverified' && (
        <ErrorMessage
          compact
          description={`Could not confirm this name has no registry yet, so nothing was submitted: ${writeBlock.message}`}
        />
      )}
    </RegistryPanel>
  )
}
