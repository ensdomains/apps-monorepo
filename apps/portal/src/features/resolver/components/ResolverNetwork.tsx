import type { Address } from 'viem/accounts'
import { NamechainSVG } from '@/assets/chains'

export const ResolverNetwork = ({
  resolverAddress,
}: {
  resolverAddress: Address
}) => {
  return (
    <div className="flex flex-row p-6 gap-6 rounded-2xl border border-secondary w-full flex-1 items-center">
      <NamechainSVG />
      <div className="flex flex-col">
        <span className="font-medium">Network</span>
        <span>
          {resolverAddress === '0x0e14eE0592da66Bb4c8a8090066BC8A5Af15f3E6'
            ? 'Sepolia'
            : 'Namechain'}
        </span>
      </div>
    </div>
  )
}
