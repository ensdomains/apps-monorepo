import { CircleAlert, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Trust warning on the name overview (WEB-125): the domain's `_ens` TXT
 * record designates a different address than the current manager, and the
 * viewer can't fix it — surface it so nobody trusts a stale identity.
 */
export const DnsOutOfSyncBanner = ({
  name,
  onRefresh,
  isRefreshing,
}: {
  readonly name: string
  readonly onRefresh: () => void
  readonly isRefreshing: boolean
}) => (
  <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-6 rounded-sm bg-message-warning-fill text-message-warning-text">
    <CircleAlert className="size-6 shrink-0 self-start" strokeWidth={1.5} />
    <div className="flex flex-col gap-1 flex-1">
      <span className="font-serif text-3xl font-normal leading-none tracking-[-0.02em]">
        DNS record is out of sync
      </span>
      <p className="text-sm">
        The domain {name} currently designates a different Ethereum address than
        the one controlling this name. Verify carefully before sending funds or
        trusting this identity.
      </p>
    </div>
    <Button
      onClick={onRefresh}
      disabled={isRefreshing}
      className="shrink-0 self-start sm:self-auto"
    >
      <RefreshCw className="size-4" />
      Refresh
    </Button>
  </div>
)
