import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import type { Address } from 'viem'
import { useEnsAvatar, useEnsName } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { CopyableRecord } from '@/components/molecules/CopyableRecord'

export const AddressDisplay = ({ address }: { address: Address }) => {
  const { data: ensName, isLoading } = useEnsName({
    address,
    universalResolverAddress: getChainContractAddress({
      chain: mainnet,
      contract: 'ensUniversalResolver',
    }),
  })

  const { data: avatar } = useEnsAvatar({
    name: ensName || undefined,
    universalResolverAddress: getChainContractAddress({
      chain: mainnet,
      contract: 'ensUniversalResolver',
    }),
  })

  if (isLoading) {
    return (
      <div className="flex flex-row items-center gap-2">
        <div
          className="w-5 h-5 rounded-sm"
          style={{
            background:
              'linear-gradient(135deg, #EF7EB8 0%, #C6BEF2 50%, #D6D4F8 100%)',
          }}
        />
        <span className="text-sm text-gray-400">Loading...</span>
      </div>
    )
  }

  const displayName = ensName || `${address.slice(0, 6)}…${address.slice(-4)}`

  return (
    <div className="flex flex-row items-center gap-2">
      {avatar ? (
        <img
          src={avatar}
          alt={displayName}
          className="w-5 h-5 rounded-sm object-cover"
        />
      ) : (
        <div
          className="w-5 h-5 rounded-sm"
          style={{
            background:
              'linear-gradient(135deg, #EF7EB8 0%, #C6BEF2 50%, #D6D4F8 100%)',
          }}
        />
      )}
      <CopyableRecord
        value={ensName || address}
        displayValue={<span>{displayName}</span>}
        className="text-sm underline decoration-dashed underline-offset-4"
      />
    </div>
  )
}
