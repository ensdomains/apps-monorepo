import { useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { match } from 'ts-pattern'
import { type Address, zeroAddress } from 'viem'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { readSubregistry } from '@/features/registry/helpers/readSubregistry'
import { useHasSetSubregistryRole } from '@/features/registry/hooks/useHasSetSubregistryRole'
import { getNameRegistriesQueryOptions } from '@/features/registry/hooks/useNameRegistryDiscovery'
import { useTransactionModal } from '@/features/transaction-manager/hooks/useTransactionModal'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import { SubregistryConfigurator } from './SubregistryConfigurator'

type ConfigureRegistryFormProps = {
  name: string
}

/**
 * Why a write was refused, if it was. `conflict` means the name gained a
 * registry while the form was open; `unverified` means the current pointer
 * could not be read at all.
 */
type WriteBlock =
  | { readonly kind: 'conflict'; readonly subregistry: Address }
  | { readonly kind: 'unverified'; readonly message: string }
  | null

/**
 * Read the parent's current pointer for the label as a verdict on writing it.
 *
 * Anything other than a confirmed empty slot blocks the write: an occupied slot
 * because `setSubregistry` replaces rather than adds — detaching the registry
 * that is there and every subname inside it (WEB-1249) — and a failed read
 * because it is no proof the slot is free.
 */
const writeBlockFor = (
  current: Awaited<ReturnType<typeof readSubregistry>>,
): WriteBlock =>
  current.match<WriteBlock>(
    (subregistry) =>
      subregistry === zeroAddress ? null : { kind: 'conflict', subregistry },
    (error) => ({
      kind: 'unverified',
      message:
        error.cause?.message ??
        'Could not read the current registry for this name.',
    }),
  )

export const ConfigureRegistryForm = ({ name }: ConfigureRegistryFormProps) => {
  const isMobile = useIsMobile()
  const { hasRole, isLoading, error, parentRegistry, connectedAddress } =
    useHasSetSubregistryRole(name)

  const [showForm, setShowForm] = useState(false)
  const [writeBlock, setWriteBlock] = useState<WriteBlock>(null)

  const queryClient = useQueryClient()
  const { closeModal: closeTransactionModal, clearTransaction } =
    useTransactionModal()

  /**
   * Prove the name still has no registry, straight from the parent registry.
   *
   * This form only renders for an empty registry slot, but that verdict was
   * resolved when the page rendered. Anyone else holding `ROLE_SET_SUBREGISTRY`
   * — or the owner in another tab — can configure the registry in between, so
   * `SubregistryConfigurator` calls this immediately before each write. There is
   * no "replace" intent to confirm in a flow titled "No registry configured": a
   * taken slot means this form is stale, not that the user asked to overwrite
   * anything. The reconfigure flow, where replacing is the point, passes no
   * guard at all.
   */
  const assertUnset = async (): Promise<boolean> => {
    if (!parentRegistry) return false

    const block = writeBlockFor(
      await readSubregistry({
        registryAddress: parentRegistry,
        label: name.split('.')[0],
      }),
    )
    setWriteBlock(block)
    if (!block) return true

    closeTransactionModal()
    clearTransaction()
    if (block.kind === 'conflict') {
      // Re-render the tree against the registry that is actually configured, so
      // this form gives way to the configured-registry view.
      void queryClient.invalidateQueries({
        queryKey: getNameRegistriesQueryOptions({ name }).queryKey,
      })
    }
    return false
  }

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

  // The name gained a registry while this form was open, so there is nothing
  // left to configure — only something to destroy. Hold the refusal until the
  // refreshed discovery query swaps this form out for the configured view.
  if (writeBlock?.kind === 'conflict') {
    return (
      <div className={wrapperClassName}>
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
      </div>
    )
  }

  return (
    <div className={wrapperClassName}>
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
    </div>
  )
}
