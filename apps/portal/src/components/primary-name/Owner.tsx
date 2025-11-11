import { useQuery } from '@tanstack/react-query'
import { sepolia } from 'viem/chains'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { CopyableRecord } from '../molecules/CopyableRecord'

const sepoliaUrl = sepolia.blockExplorers.default.url

interface OwnerProps {
  name: string
}

export const Owner = ({ name }: OwnerProps) => {
  const { data, error, isLoading } = useQuery(getEnsOwnerQueryOptions({ name }))

  if (error) return <div>Error: {error.cause?.message}</div>
  if (isLoading) return <div>Loading...</div>
  if (!data) return null

  return (
    <span className="flex flex-row gap-1 items-baseline">
      <span>Owned by</span>
      <CopyableRecord
        className="max-w-40 sm:max-w-54 xl:max-w-80"
        value={data.owner}
        href={`${sepoliaUrl}/address/${data.owner}`}
      />
    </span>
  )
}
