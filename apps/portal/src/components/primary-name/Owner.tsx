import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { Address } from 'viem'
import { useEnsName } from 'wagmi'
import { NameAvatar } from '@/features/profile/components/NameAvatar'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'

const OwnerWithENS = ({ owner }: { owner: Address }) => {
  const { data: ownerName, error, isLoading } = useEnsName({ address: owner })

  if (error) return <div>{error.message}</div>
  if (isLoading) return <div>Loading</div>

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
        <span className="font-medium">Owner</span>
        <span>{ownerName || shortenedAddress}</span>
      </div>
    </Link>
  )
}

interface OwnerProps {
  name: string
}

export const Owner = ({ name }: OwnerProps) => {
  const { data, error, isLoading } = useQuery(getEnsOwnerQueryOptions({ name }))

  if (error) return <div>Error: {error.cause?.message}</div>
  if (isLoading) return <div>Loading...</div>
  if (!data?.owner) return null

  return <OwnerWithENS owner={data.owner} />
}
