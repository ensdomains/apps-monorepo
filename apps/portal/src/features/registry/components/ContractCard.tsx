import { FileCode } from 'lucide-react'
import type { Address } from 'viem'
import { EntityBadge } from '@/components/EntityBadge'
import { BlockCard } from '@/features/dashboard/components'
import { useBlockExplorerAddressUrl } from '@/utils/blockExplorer/useBlockExplorerUrl'
import { truncateAddress } from '@/utils/formatting/truncateAddress'

type ContractCardProps = {
  label?: string
  address: Address
  chainId?: number
}

export function ContractCard({
  label = 'Contract',
  address,
  chainId,
}: ContractCardProps) {
  const explorerUrl = useBlockExplorerAddressUrl(address, chainId)

  return (
    <BlockCard className="gap-3">
      <div className="flex-1 flex items-center justify-between min-w-0 gap-2">
        <div className="flex items-center gap-2 text-muted-foreground min-w-0">
          <FileCode className="size-4 shrink-0" />
          <span className="text-sm truncate">{label}</span>
        </div>
        <EntityBadge
          inline
          variant="contract"
          address={address}
          etherscanHref={explorerUrl}
        >
          {truncateAddress(address)}
        </EntityBadge>
      </div>
    </BlockCard>
  )
}
