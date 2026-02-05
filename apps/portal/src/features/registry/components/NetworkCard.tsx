import { NamechainSVG } from '@/assets/chains'
import type { EnsNetworkName } from '../../../utils/types'

type NetworkCardProps = {
  network: EnsNetworkName
}

export function NetworkCard({ network }: NetworkCardProps) {
  const isNamechain = network === 'namechainSepolia'

  return (
    <div className="p-6 flex flex-row rounded-2xl gap-6 items-center border border-gray-300">
      {isNamechain ? (
        <NamechainSVG height={40} width={40} />
      ) : (
        <img src="/icons/eth.svg" alt="" className="w-10 h-10" />
      )}
      <div className="flex flex-col">
        <span className="font-medium">Network</span>
        <span>Sepolia</span>
      </div>
    </div>
  )
}
