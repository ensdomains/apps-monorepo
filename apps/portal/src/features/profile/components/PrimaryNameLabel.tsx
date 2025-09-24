import { useAccount, useEnsAddress } from 'wagmi'

export const PrimaryNameLabel = ({ name }: { name: string }) => {
  const { address } = useAccount()

  const { data: reverseAddress, error, isLoading } = useEnsAddress({ name })

  if (error) return <div>Error: {error.message}</div>
  if (isLoading) return <div>Loading...</div>

  if (address === reverseAddress)
    return (
      <div className="bg-gray-200 px-3 py-1 rounded-4xl">Your primary name</div>
    )
  return null
}
