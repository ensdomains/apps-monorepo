import { Plus } from 'lucide-react'
import { useState } from 'react'
import { match } from 'ts-pattern'
import { zeroAddress } from 'viem'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useHasSetSubregistryRole } from '@/features/registry/hooks/useHasSetSubregistryRole'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import { SubregistryConfigurator } from './SubregistryConfigurator'

type ConfigureRegistryFormProps = {
  name: string
}

export function ConfigureRegistryForm({ name }: ConfigureRegistryFormProps) {
  const isMobile = useIsMobile()
  const { hasRole, isLoading, error, parentRegistry, connectedAddress } =
    useHasSetSubregistryRole(name)

  const [showForm, setShowForm] = useState(false)

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

  return (
    <div
      className={cn(
        'flex flex-col gap-4 max-w-xl',
        isMobile ? 'pl-0 pt-3' : 'pl-14',
      )}
    >
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
            <p className="text-sm text-muted-foreground">
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
    </div>
  )
}
