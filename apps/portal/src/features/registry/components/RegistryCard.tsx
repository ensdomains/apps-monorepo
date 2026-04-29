import type { Address } from 'viem'
import { EntityBadgeWithActions } from '@/components/EntityBadge'
import { BlockCard } from '@/features/dashboard/components'
import { useBlockExplorerAddressUrl } from '@/utils/blockExplorer/useBlockExplorerUrl'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import type { ProtocolVersion } from '@/utils/types'

type RegistryInfo = {
  address?: Address
  protocol: ProtocolVersion
  factory?: Address
}

type RegistryCardProps = {
  registry: RegistryInfo
  chainId?: number
}

const ContractAddressRow = ({
  label,
  address,
  explorerUrl,
}: {
  label: string
  address: Address
  explorerUrl?: string
}) => (
  <div className="flex items-center justify-between min-w-0 gap-2">
    <span className="text-sm text-muted-foreground shrink-0 min-w-15">
      {label}
    </span>
    <EntityBadgeWithActions
      inline
      variant="contract"
      address={address}
      etherscanHref={explorerUrl}
    >
      {truncateAddress(address)}
    </EntityBadgeWithActions>
  </div>
)

export const RegistryCard = ({ registry, chainId }: RegistryCardProps) => {
  const addressUrl = useBlockExplorerAddressUrl(registry.address, chainId)
  const factoryUrl = useBlockExplorerAddressUrl(registry.factory, chainId)

  return (
    <BlockCard className="flex-col items-stretch gap-3">
      <div className="flex items-center justify-between min-w-0 gap-2">
        <span className="text-sm text-muted-foreground shrink-0 min-w-15">
          Protocol
        </span>
        <span className="text-sm font-medium text-foreground shrink-0">
          {registry.protocol}
        </span>
      </div>

      {registry.address && (
        <ContractAddressRow
          label="Contract"
          address={registry.address}
          explorerUrl={addressUrl}
        />
      )}

      {registry.factory && (
        <ContractAddressRow
          label="Factory"
          address={registry.factory}
          explorerUrl={factoryUrl}
        />
      )}
    </BlockCard>
  )
}
