import type { Address } from 'viem'
import { useEnsAddress } from 'wagmi'
import { LoadingSpinner } from '@/components/molecules/LoadingSpinner'

export const PrimaryNameLabel = ({
  name,
  text = 'Your primary name',
  address,
}: {
  name: string
  text?: string
  address: Address | null | undefined
}) => {
  const { data: reverseAddress, error, isLoading } = useEnsAddress({ name })

  if (error) return <div>Error: {error.message}</div>
  if (isLoading) return <LoadingSpinner title="Loading..." />

  if (address === reverseAddress)
    return <div className="bg-gray-200 px-3 py-1 rounded-4xl">{text}</div>
  return null
}
