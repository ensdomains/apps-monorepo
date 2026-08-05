import { Plus } from 'lucide-react'
import { useState } from 'react'
import { zeroAddress } from 'viem'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { Button } from '@/components/ui/button'
import { useHasSetSubregistryRole } from '@/features/registry/hooks/useHasSetSubregistryRole'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import { SubregistryConfigurator } from './SubregistryConfigurator'

type ConfigureRegistryFormProps = {
  name: string
}

const NoRegistryConfiguredCard = ({ name }: { name: string }) => (
  <div className="flex flex-col gap-4 bg-neutral-2 p-6 rounded-xl">
    <h3 className="text-3xl font-normal leading-none tracking-[-0.02em] font-serif">
      No registry configured
    </h3>
    <p className="text-p">
      This name doesn't have a contract set to create and manage subnames.
      Create one to turn <strong>{name}</strong> into its own namespace with
      subnames like <strong>cold.{name}</strong> or{' '}
      <strong>agent.{name}</strong>.
    </p>
  </div>
)

export function ConfigureRegistryForm({ name }: ConfigureRegistryFormProps) {
  const isMobile = useIsMobile()
  const { hasRole, isLoading, error, parentRegistry, connectedAddress } =
    useHasSetSubregistryRole(name)

  const [showForm, setShowForm] = useState(false)

  const wrapperClassName = cn(
    'flex flex-col gap-4 max-w-xl',
    isMobile ? 'pl-0 pt-3' : 'pl-14',
  )

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

  if (!hasRole) {
    return (
      <div className={wrapperClassName}>
        <NoRegistryConfiguredCard name={name} />
        <div className="flex flex-col gap-2">
          <Button className="w-full" variant="default" disabled>
            <Plus className="size-3" />
            Configure registry
          </Button>
          <p className="text-sm text-muted-foreground">
            You need the{' '}
            <strong className="text-foreground">Set Subregistry</strong> role to
            configure this registry. Ask an admin to grant it.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className={wrapperClassName}>
      <NoRegistryConfiguredCard name={name} />
      {showForm ? (
        <SubregistryConfigurator
          name={name}
          onCancel={() => setShowForm(false)}
        />
      ) : (
        <Button
          className="w-full"
          variant="default"
          onClick={() => setShowForm(true)}
        >
          <Plus className="size-3" />
          Configure registry
        </Button>
      )}
    </div>
  )
}
