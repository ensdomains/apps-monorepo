import type { Hash } from 'viem'
import { CopyButton } from '@/components/CopyButton'
import { EntityBadge } from '@/components/EntityBadge'
import { cn } from '@/lib/utils'
import { useBlockExplorerTxUrl } from '@/utils/blockExplorer/useBlockExplorerUrl'
import { truncateAddress } from '@/utils/formatting/truncateAddress'

interface BlockExplorerTxLinkProps {
  readonly txHash: Hash
  readonly chainId?: number
  readonly className?: string
  readonly showCopy?: boolean
}

/**
 * Renders an EntityBadge (tx) with a block explorer link and copy button for a transaction.
 * Use in table cells and other places where tx hash + explorer link is needed.
 */
export const BlockExplorerTxLink = ({
  txHash,
  chainId,
  className,
  showCopy = true,
}: BlockExplorerTxLinkProps) => {
  const href = useBlockExplorerTxUrl(txHash, chainId)

  return (
    <div className={cn('inline-flex items-center gap-1', className)}>
      <EntityBadge variant="tx" externalHref={href}>
        {truncateAddress(txHash)}
      </EntityBadge>
      {showCopy && <CopyButton value={txHash} />}
    </div>
  )
}
