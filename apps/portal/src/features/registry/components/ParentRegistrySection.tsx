import { Copy } from 'lucide-react'
import type { Address } from 'viem'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

type ParentRegistrySectionProps = {
  parent: {
    name: string
    address: Address
  }
  owner: {
    name?: string
    address: Address
  }
  network: {
    name: string
    icon?: string
  }
  protocol: string
  chainId: number
  contract: Address
}

export function ParentRegistrySection({
  parent,
  owner,
  network,
  protocol,
  chainId,
  contract,
}: ParentRegistrySectionProps) {
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">Parent registry</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="border border-gray-300 rounded-lg p-6 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="text-gray-400">ⓘ</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded bg-gradient-to-br from-purple-400 to-pink-400" />
            <div className="flex flex-col">
              <span className="text-sm text-gray-600">Parent</span>
              <span className="font-medium underline decoration-dotted">
                {parent.name}
              </span>
            </div>
          </div>
        </div>

        <div className="border border-gray-300 rounded-lg p-6 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="text-gray-400">ⓘ</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded bg-gradient-to-br from-purple-400 to-pink-400" />
            <div className="flex flex-col">
              <span className="text-sm text-gray-600">Owner</span>
              <span className="font-medium underline decoration-dotted">
                {owner.name ||
                  `${owner.address.slice(0, 6)}...${owner.address.slice(-4)}`}
              </span>
            </div>
          </div>
        </div>

        <div className="border border-gray-300 rounded-lg p-6 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="text-gray-400">ⓘ</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded bg-blue-500 flex items-center justify-center">
              {network.icon ? (
                <img
                  src={network.icon}
                  alt={network.name}
                  className="w-6 h-6"
                />
              ) : (
                <span className="text-white font-bold">{network.name[0]}</span>
              )}
            </div>
            <div className="flex flex-col">
              <span className="text-sm text-gray-600">Network</span>
              <span className="font-medium">{network.name}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="border border-gray-300 rounded-lg p-6 flex flex-col gap-3">
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
          <span className="text-sm font-medium">{protocol}</span>
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
            onClick={() => copyToClipboard(String(chainId))}
            className="text-sm font-mono hover:text-gray-600 flex items-center gap-1"
          >
            {chainId}
            <Copy className="size-3" />
          </button>
        </div>

        <div className="flex items-center justify-between py-2">
          <span className="text-sm text-gray-600">Contract</span>
          <button
            type="button"
            onClick={() => copyToClipboard(contract)}
            className="text-sm font-mono hover:text-gray-600 flex items-center gap-1 underline decoration-dotted"
          >
            {contract}
            <Copy className="size-3" />
          </button>
        </div>
      </div>
    </div>
  )
}
