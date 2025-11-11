import type { Address } from 'viem'
import { useEnsAddress } from 'wagmi'

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
  if (isLoading) return <div>Loading...</div>

  if (address === reverseAddress)
    return <div className="bg-gray-200 px-3 py-1 rounded-4xl">{text}</div>
  return null
}
