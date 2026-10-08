import { CircleAlert, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DnssecDebugLink } from '@/features/dnssec-debug/components/DnssecDebugLink'
import { TransactionModal } from '@/features/transaction-manager/components/TransactionModal'
import { useSyncManagerTransaction } from '../hooks/useSyncManagerTransaction'

/**
 * Owner-only warning on the name overview (WEB-465): the connected wallet is
 * the DNS Owner (the `_ens` TXT address) but not the manager, so it can't make
 * changes until it syncs the manager role via `proveAndClaim`.
 */
export const SyncManagerBanner = ({ name }: { readonly name: string }) => {
  const { transactions, startSync, isPreparing, prepareError } =
    useSyncManagerTransaction({ name })

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-6 rounded-sm bg-message-warning-fill text-message-warning-text">
        <CircleAlert className="size-6 shrink-0" strokeWidth={1.5} />
        <p className="text-sm flex-1">
          You cannot make changes to this name because you are the DNS Owner,
          but not the Manager. Sync Manager to Owner to fix this and make
          changes.
        </p>
        <Button
          onClick={startSync}
          disabled={isPreparing}
          className="shrink-0 self-start sm:self-auto"
        >
          <RefreshCw className="size-4" />
          {isPreparing ? 'Preparing…' : 'Sync Manager'}
        </Button>
      </div>
      {prepareError && (
        <>
          <p className="text-sm text-message-danger-text">
            Could not prepare the sync — the DNS record may have changed.
            Refresh and try again.
          </p>
          <DnssecDebugLink name={name} source="sync" />
        </>
      )}
      <TransactionModal transactions={transactions} />
    </div>
  )
}
