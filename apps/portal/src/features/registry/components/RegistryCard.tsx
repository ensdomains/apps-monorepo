import { ExternalLink } from 'react-external-link'
import type { Address } from 'viem'
import { CopyButton } from '@/components/CopyButton'
import { EntityBadge } from '@/components/EntityBadge'
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
  <div className="flex items-center justify-start gap-3">
    <span className="text-sm text-muted-foreground shrink-0 min-w-[60px]">
      {label}
    </span>
    <div className="flex items-center gap-2 min-w-0 flex-1">
      {explorerUrl ? (
        <ExternalLink href={explorerUrl}>
          <EntityBadge variant="contract">
            {truncateAddress(address)}
          </EntityBadge>
        </ExternalLink>
      ) : (
        <EntityBadge variant="contract">{truncateAddress(address)}</EntityBadge>
      )}
      <CopyButton value={address} size="sm" />
    </div>
  </div>
)

export const RegistryCard = ({ registry, chainId }: RegistryCardProps) => {
  const addressUrl = useBlockExplorerAddressUrl(registry.address, chainId)
  const factoryUrl = useBlockExplorerAddressUrl(registry.factory, chainId)

  return (
    <div className="border border-border rounded-lg p-4 sm:p-6 flex flex-col items-center gap-4 relative w-full">
      <div className="flex flex-col gap-3 w-full">
        <div className="flex items-center justify-start gap-3">
          <span className="text-sm text-muted-foreground min-w-15">
            Protocol
          </span>
          <span className="text-sm font-medium">{registry.protocol}</span>
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
      </div>
    </div>
  )
}
