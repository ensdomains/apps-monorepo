import { useEnsAvatar } from 'wagmi'
import { LoadingSpinner } from '@/components/molecules/LoadingSpinner'

export const NameAvatar = ({
  name,
  height = '138px',
  width = '138px',
  rounded = 'rounded-lg',
}: {
  name: string
  height?: string
  width?: string
  rounded?: string
}) => {
  const {
    data: avatar,
    error,
    isLoading,
  } = useEnsAvatar({
    name,
  })

  if (error) return <div>Error: {error.message}</div>
  if (isLoading) return <LoadingSpinner title="Loading..." />

  if (avatar)
    return (
      <img
        src={avatar}
        alt="avatar"
        className={rounded}
        height={height}
        width={width}
      />
    )
  return null
}
