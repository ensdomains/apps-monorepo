import { scopeTransactionId } from '@ens-apps/transaction-manager'
import { RotateCcw } from 'lucide-react'
import { match, P } from 'ts-pattern'
import { type Address, zeroAddress } from 'viem'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { Button } from '@/components/ui/button'
import { prepareSetSubregistryTransaction } from '@/features/registry/helpers/setSubregistry'
import { useHasSetSubregistryRole } from '@/features/registry/hooks/useHasSetSubregistryRole'
import { useSetSubregistry } from '@/features/registry/hooks/useSetSubregistry'
import { useSubregistryWriteGuard } from '@/features/registry/hooks/useSubregistryWriteGuard'
import { TransactionModal } from '@/features/transaction-manager/components/TransactionModal'
import { useFlowAttempt } from '@/features/transaction-manager/hooks/useFlowAttempt'
import { useTransactionModal } from '@/features/transaction-manager/hooks/useTransactionModal'

const RESTORE_SUBREGISTRY_TX_ID = 'tx-restore-subregistry'

type RestorePreviousRegistryProps = {
  readonly name: string
  readonly previousRegistry: Address
}

/**
 * Points a detached name back at the registry it was cleared from. Only ever
 * into an empty slot: the write guard re-reads it before each write, so a
 * registry configured since the page loaded is never replaced.
 */
export const RestorePreviousRegistry = ({
  name,
  previousRegistry,
}: RestorePreviousRegistryProps) => {
  const {
    hasRole,
    isLoading,
    error,
    parentRegistry,
    connectedAddress,
    resourceId,
  } = useHasSetSubregistryRole(name)

  const { writeBlock, assertUnset } = useSubregistryWriteGuard({
    name,
    parentRegistry,
    resourceId,
  })

  const { closeModal, clearTransaction } = useTransactionModal()
  const attempt = useFlowAttempt()
  const txId = scopeTransactionId(RESTORE_SUBREGISTRY_TX_ID, attempt.scope)
  const { setSubregistry } = useSetSubregistry({
    name,
    resourceId,
    parentRegistry: parentRegistry ?? zeroAddress,
    id: txId,
  })
  // A landed restore swaps this view out before Done can be clicked, and the
  // last step never auto-advances, so the shared modal is closed on success too.
  const endRestore = () => {
    closeModal()
    clearTransaction()
    attempt.end()
  }

  if (isLoading) return <LoadingSpinner title="Checking permissions..." />

  if (error)
    return (
      <ErrorMessage
        compact
        description="Couldn't check whether you can restore this registry. Refresh the page to try again."
      />
    )

  if (!parentRegistry || parentRegistry === zeroAddress)
    return (
      <ErrorMessage
        compact
        description="Couldn't find the registry this name is in, so it can't be restored here. Refresh the page to try again."
      />
    )

  return (
    <>
      {match({ connectedAddress, hasRole })
        .with({ connectedAddress: P.nullish }, () => (
          <RestoreUnavailable reason="Connect a wallet holding the Set Subregistry role to restore it." />
        ))
        .with({ hasRole: P.not(true) }, () => (
          <RestoreUnavailable reason="You need the Set Subregistry role to restore it. Ask an admin to grant it." />
        ))
        .with({ connectedAddress: P.string }, ({ connectedAddress }) => (
          <Button
            type="button"
            className="w-full"
            variant="default"
            onClick={async () => {
              if (await assertUnset()) attempt.start(connectedAddress)
            }}
          >
            <RotateCcw className="size-3" />
            Restore previous registry
          </Button>
        ))
        .exhaustive()}
      {writeBlock?.kind === 'unverified' && (
        <ErrorMessage
          compact
          description={`Could not confirm this name still has no registry, so nothing was submitted: ${writeBlock.message}`}
        />
      )}
      <TransactionModal
        transactions={[
          {
            id: txId,
            title: 'Restore registry',
            transactionName: `Restore registry for ${name}`,
            intent: {
              prepare: resourceId
                ? ({ walletClient, chainId }) =>
                    prepareSetSubregistryTransaction({
                      resourceId,
                      parentRegistry,
                      subregistryAddress: previousRegistry,
                      walletClient,
                      chainId,
                    })
                : undefined,
            },
            onStart: async () => {
              if (await assertUnset())
                setSubregistry(previousRegistry, { onSuccess: endRestore })
            },
            onDone: endRestore,
          },
        ]}
      />
    </>
  )
}

const RestoreUnavailable = ({ reason }: { readonly reason: string }) => (
  <div className="flex flex-col gap-2">
    <Button type="button" className="w-full" variant="default" disabled>
      <RotateCcw className="size-3" />
      Restore previous registry
    </Button>
    <p className="text-p text-muted-foreground">{reason}</p>
  </div>
)
