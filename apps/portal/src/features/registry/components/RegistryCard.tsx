import type { Address } from 'viem'
import { CopyableRecord } from '@/components/molecules/CopyableRecord'
import type { ProtocolVersion } from '@/utils/types'

export type RegistryInfo = {
  address: Address
  protocol: ProtocolVersion
  factory: Address | null
}

type RegistryCardProps = {
  registry: RegistryInfo
}

export function RegistryCard({ registry }: RegistryCardProps) {
  return (
    <div className="border border-gray-300 rounded-lg p-4 sm:p-6 flex flex-col items-center gap-4 relative w-full">
      <div className="flex flex-col gap-3 w-full">
        <div className="flex items-center justify-start gap-3 ">
          <span className="text-sm text-gray-600 min-w-[60px]">Protocol</span>
          <span className="text-sm font-medium">{registry.protocol}</span>
        </div>

        <div className="flex items-center justify-start gap-3">
          <span className="text-sm text-gray-600 shrink-0 min-w-[60px]">
            Contract
          </span>
          <CopyableRecord
            value={registry.address}
            className="underline decoration-dotted underline-offset-4 flex-1 min-w-0"
          />
        </div>

        {registry.factory && (
          <div className="flex items-center justify-start gap-3">
            <span className="text-sm text-gray-600 shrink-0 min-w-[60px]">
              Factory
            </span>
            <CopyableRecord
              value={registry.factory}
              className="underline decoration-dotted underline-offset-4 flex-1 min-w-0"
            />
          </div>
        )}
      </div>
    </div>
  )
}
