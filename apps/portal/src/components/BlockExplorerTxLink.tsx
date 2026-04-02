import { CheckIcon, CopyIcon } from 'lucide-react'
import { useState } from 'react'
import { ExternalLink } from 'react-external-link'
import type { Hash } from 'viem'
import { EntityBadge } from '@/components/EntityBadge'
import { cn } from '@/lib/utils'
import { useBlockExplorerTxUrl } from '@/utils/blockExplorer/useBlockExplorerUrl'
import { truncateAddress } from '@/utils/formatting/truncateAddress'

interface BlockExplorerTxLinkProps {
  readonly txHash: Hash
  readonly chainId?: number
  readonly className?: string
}

/**
 * Renders an EntityBadge (citrine) with a block explorer link for a transaction.
 * Use in table cells and other places where tx hash + explorer link is needed.
 */
export const BlockExplorerTxLink = ({
  txHash,
  chainId,
  className,
}: BlockExplorerTxLinkProps) => {
  const href = useBlockExplorerTxUrl(txHash, chainId)
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(txHash)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {href ? (
        <ExternalLink href={href}>
          <EntityBadge variant="tx">{truncateAddress(txHash)}</EntityBadge>
        </ExternalLink>
      ) : (
        <EntityBadge variant="tx">{truncateAddress(txHash)}</EntityBadge>
      )}
      <button
        type="button"
        className="shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
        onClick={handleCopy}
      >
        {copied ? (
          <CheckIcon className="size-3" />
        ) : (
          <CopyIcon className="size-3" />
        )}
      </button>
    </div>
  )
}
