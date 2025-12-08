import type { Address } from 'viem'
import { useEnsName } from 'wagmi'
import { CopyableRecord } from '@/components/molecules/CopyableRecord'
import { NameAvatar } from '@/features/profile/components/NameAvatar'

interface AddressDisplayProps {
  address: Address
  short?: boolean
}

export const AddressDisplay = ({
  address,
  short = true,
}: AddressDisplayProps) => {
  const { data: ensName, isLoading } = useEnsName({ address })

  if (isLoading) {
    return (
      <div className="flex flex-row items-center gap-2">
        <div className="w-5 h-5 rounded-sm [background:var(--avatar-placeholder-gradient)]" />
        <span className="text-sm text-gray-400">Loading...</span>
      </div>
    )
  }

  const displayName =
    ensName || (short ? `${address.slice(0, 6)}…${address.slice(-4)}` : address)

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
        <div className="w-5 h-5 rounded-sm [background:var(--avatar-placeholder-gradient)]" />
      )}
      <CopyableRecord
        value={ensName || address}
        displayValue={<span>{displayName}</span>}
        className="text-sm underline decoration-dashed underline-offset-4"
      />
    </div>
  )
}
