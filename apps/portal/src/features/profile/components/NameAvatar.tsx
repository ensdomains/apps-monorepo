import { useEnsAvatar } from 'wagmi'
import { wagmiConfig } from '@/lib/wagmi'

export const NameAvatar = ({
  name,
  height = '138px',
  width = '138px',
}: {
  name: string
  height?: string
  width?: string
}) => {
  const {
    data: avatar,
    error,
    isLoading,
  } = useEnsAvatar({
    name,
    universalResolverAddress:
      wagmiConfig.chains[0].contracts.ensUniversalResolver.address,
  })

  if (error) return <div>Error: {error.message}</div>
  if (isLoading) return <div>Loading...</div>

  if (avatar)
    return (
      <img
        src={avatar}
        alt="avatar"
        className={`rounded-lg`}
        height={height}
        width={width}
      />
    )
  return null
}
