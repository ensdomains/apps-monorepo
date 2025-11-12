import { Copy, ShieldCheck } from 'lucide-react'
import type { Address } from 'viem'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

export type RegistryInfo = {
  address: Address
  isVerified: boolean
  owner: {
    name?: string
    address: Address
  }
  network: {
    name: string
    chainId: number
    icon?: string
  }
  protocol: string
  factory?: Address
}

type RegistryCardProps = {
  registry: RegistryInfo
}

export function RegistryCard({ registry }: RegistryCardProps) {
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  return (
    <div className="border border-gray-300 rounded-lg overflow-hidden">
      {registry.isVerified && (
        <div className="bg-gray-100 p-4 flex items-center gap-3">
          <ShieldCheck className="size-6 text-green-600 flex-shrink-0" />
          <p className="text-sm text-gray-700">
            This registry was deployed via the official ENS Registry Factory.
            This registry has been audited and is considered secure.
          </p>
        </div>
      )}

      <div className="p-6 flex flex-col gap-3">
        <div className="flex items-center justify-between py-2">
          <span className="text-sm text-gray-600 flex items-center gap-2">
            Protocol
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <span className="text-gray-400 cursor-help">ⓘ</span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>The ENS protocol version</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </span>
          <span className="text-sm font-medium">{registry.protocol}</span>
        </div>

        <div className="flex items-center justify-between py-2">
          <span className="text-sm text-gray-600 flex items-center gap-2">
            Chain ID
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <span className="text-gray-400 cursor-help">ⓘ</span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>The blockchain network identifier</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </span>
          <button
            type="button"
            onClick={() => copyToClipboard(String(registry.network.chainId))}
            className="text-sm font-mono hover:text-gray-600 flex items-center gap-1"
          >
            {registry.network.chainId}
            <Copy className="size-3" />
          </button>
        </div>

        <div className="flex items-center justify-between py-2">
          <span className="text-sm text-gray-600">Contract</span>
          <button
            type="button"
            onClick={() => copyToClipboard(registry.address)}
            className="text-sm font-mono hover:text-gray-600 flex items-center gap-1 underline decoration-dotted"
          >
            {registry.address}
            <Copy className="size-3" />
          </button>
        </div>

        {registry.factory && (
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-gray-600">Factory</span>
            <button
              type="button"
              onClick={() => copyToClipboard(registry.factory!)}
              className="text-sm font-mono hover:text-gray-600 flex items-center gap-1 underline decoration-dotted"
            >
              {registry.factory}
              <Copy className="size-3" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
