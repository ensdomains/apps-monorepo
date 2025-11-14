import { NamechainSVG } from '@/assets/chains'

export type NetworkLocation = 'L1' | 'L2' | 'unknown'

export type NetworkCardProps = {
  network: {
    name: string
    location: NetworkLocation
  }
}

export function NetworkCard({ network }: NetworkCardProps) {
  const isL2 = network.location === 'L2'

  return (
    <div className="p-6 flex flex-row rounded-2xl gap-6 items-center border border-gray-300">
      {isL2 ? (
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
