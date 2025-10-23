import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import type { Address } from 'viem'
import { useEnsName } from 'wagmi'
import { sepolia } from 'wagmi/chains'
import { CopyableRecord } from '@/components/molecules/CopyableRecord'
import { NameAvatar } from '@/features/profile/components/NameAvatar'

export const AddressDisplay = ({ address }: { address: Address }) => {
  const { data: ensName, isLoading } = useEnsName({
    address,
    universalResolverAddress: getChainContractAddress({
      chain: sepolia,
      contract: 'ensUniversalResolver',
    }),
  })

  if (isLoading) {
    return (
      <div className="flex flex-row items-center gap-2">
        <div
          className="w-5 h-5 rounded-sm"
          style={{
            background: 'var(--avatar-placeholder-gradient)',
          }}
        />
        <span className="text-sm text-gray-400">Loading...</span>
      </div>
    )
  }

  const displayName = ensName || `${address.slice(0, 6)}…${address.slice(-4)}`

  return (
    <div className="flex flex-row items-center gap-2">
      {ensName ? (
        <NameAvatar
          name={ensName}
          height="20px"
          width="20px"
          rounded="rounded-sm"
        />
      ) : (
        <div
          className="w-5 h-5 rounded-sm"
          style={{
            background: 'var(--avatar-placeholder-gradient)',
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
