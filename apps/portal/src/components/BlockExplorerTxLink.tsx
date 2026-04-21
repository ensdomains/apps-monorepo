import type { Hash } from 'viem'
import { EntityBadgeWithActions } from '@/components/EntityBadge'
import { cn } from '@/lib/utils'
import { useBlockExplorerTxUrl } from '@/utils/blockExplorer/useBlockExplorerUrl'
import { truncateAddress } from '@/utils/formatting/truncateAddress'

interface BlockExplorerTxLinkProps {
  readonly txHash: Hash
  readonly chainId?: number
  readonly className?: string
}

/**
 * Renders an EntityBadgeWithActions (tx) with block explorer link, copy, and Etherscan chips.
 */
export const BlockExplorerTxLink = ({
  txHash,
  chainId,
  className,
}: BlockExplorerTxLinkProps) => {
  const href = useBlockExplorerTxUrl(txHash, chainId)

  return (
    <div className={cn('inline-flex items-center', className)}>
      <EntityBadgeWithActions
        variant="tx"
        copyValue={txHash}
        etherscanHref={href}
      >
        {truncateAddress(txHash)}
      </EntityBadgeWithActions>
    </div>
  )
}
