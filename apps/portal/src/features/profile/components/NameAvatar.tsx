import { useEnsAvatar } from 'wagmi'

export const NameAvatar = ({
  name,
  height = '142px',
  width = '142px',
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
  if (isLoading) return <div>Loading...</div>

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
