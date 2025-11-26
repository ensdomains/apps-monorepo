import type { Address } from 'viem'
import { NamechainSVG } from '@/assets/chains'

export type NetworkLocation = 'sepolia' | 'sepoliaNamechain'

export type NameChainLocation = {
  name: string
  location: NetworkLocation
  chainId: number
  registryAddress: Address | null
}

export type NetworkCardProps = {
  network: {
    name: string
    location: NetworkLocation
  }
}

export function NetworkCard({ network }: NetworkCardProps) {
  const isNamechain = network.location === 'sepoliaNamechain'

  return (
    <div className="p-6 flex flex-row rounded-2xl gap-6 items-center border border-gray-300">
      {isNamechain ? (
        <NamechainSVG height={40} width={40} />
      ) : (
        <img src="/icons/eth.svg" alt="" className="w-10 h-10" />
      )}
      <div className="flex flex-col">
        <span className="font-medium">Network</span>
        <span>{network.name}</span>
      </div>
    </div>
  )
}
