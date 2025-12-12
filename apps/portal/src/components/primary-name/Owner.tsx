import { Link } from '@tanstack/react-router'
import type { Address } from 'viem'
import { useEnsName } from 'wagmi'
import { NameAvatar } from '@/features/profile/components/NameAvatar'

export const Owner = ({
  owner,
  label = 'Owner',
}: {
  owner?: Address
  label?: string
}) => {
  const {
    data: ownerName,
    error,
    isLoading,
  } = useEnsName({ address: owner, query: { enabled: Boolean(owner) } })

  if (error) return <div>{error.message}</div>
  if (isLoading) return <div>Loading</div>

  if (!owner)
    return (
      <div className="p-6 flex flex-col rounded-2xl border border-gray-300 hover:bg-gray-100">
        <span className="font-medium">Owner</span>
        <span>No data</span>
      </div>
    )

  const shortenedAddress = `${owner.slice(0, 6)}...${owner.slice(-4)}`

  return (
    <Link
      to="/addr/$addr"
      params={{ addr: owner }}
      className="p-6 flex flex-row rounded-2xl gap-6 items-center border border-gray-300 hover:bg-gray-100"
    >
      <NameAvatar
        width="40px"
        height="40px"
        name={ownerName || shortenedAddress}
      />
      <div className="flex flex-col">
        <span className="font-medium">{label}</span>
        <span>{ownerName || shortenedAddress}</span>
      </div>
    </Link>
  )
}
