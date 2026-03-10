import type { ReactNode } from 'react'
import { CopyableRecord } from '@/components/CopyableRecord'
import { useBlockExplorerTxUrl } from '@/utils/blockExplorer/useBlockExplorerUrl'
import { truncateAddress } from '@/utils/formatting/truncateAddress'

interface BlockExplorerTxLinkProps {
  readonly txHash: string
  readonly chainId?: number
  readonly className?: string
  readonly displayValue?: ReactNode
}

/**
 * Renders a CopyableRecord with a block explorer link for a transaction.
 * Use in table cells and other places where tx hash + explorer link is needed.
 */
export function BlockExplorerTxLink({
  txHash,
  chainId,
  className = 'text-sm underline decoration-dashed underline-offset-4',
  displayValue,
}: BlockExplorerTxLinkProps) {
  const href = useBlockExplorerTxUrl(txHash, chainId)

  return (
    <CopyableRecord
      value={txHash}
      displayValue={
        displayValue ?? (
          <span className="font-mono">{truncateAddress(txHash)}</span>
        )
      }
      className={className}
      href={href}
    />
  )
}
