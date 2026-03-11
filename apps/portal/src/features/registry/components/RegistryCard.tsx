import type { Address } from 'viem'
import { CopyableRecord } from '@/components/CopyableRecord'
import { useBlockExplorerAddressUrl } from '@/utils/blockExplorer/useBlockExplorerUrl'
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

export function RegistryCard({ registry, chainId }: RegistryCardProps) {
  const addressUrl = useBlockExplorerAddressUrl(registry.address, chainId)
  const factoryUrl = useBlockExplorerAddressUrl(registry.factory, chainId)
  return (
    <div className="border border-border rounded-lg p-4 sm:p-6 flex flex-col items-center gap-4 relative w-full">
      <div className="flex flex-col gap-3 w-full">
        <div className="flex items-center justify-start gap-3 ">
          <span className="text-sm text-quartz-500 min-w-[60px]">Protocol</span>
          <span className="text-sm font-medium">{registry.protocol}</span>
        </div>

        {registry.address && (
          <div className="flex items-center justify-start gap-3">
            <span className="text-sm text-quartz-500 shrink-0 min-w-[60px]">
              Contract
            </span>
            <CopyableRecord
              href={addressUrl}
              value={registry.address}
              className="min-w-0 flex-1"
            />
          </div>
        )}

        {registry.factory && (
          <div className="flex items-center justify-start gap-3">
            <span className="text-sm text-quartz-500 shrink-0 min-w-[60px]">
              Factory
            </span>
            <CopyableRecord
              href={factoryUrl}
              value={registry.factory}
              className="min-w-0 flex-1"
            />
          </div>
        )}
      </div>
    </div>
  )
}
