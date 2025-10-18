import { useEnsAvatar } from 'wagmi'

export const NameAvatar = ({
  name,
  height = '138px',
  width = '138px',
}: {
  name: string
  height?: string
  width?: string
}) => {
  const { data: avatar, error, isLoading } = useEnsAvatar({ name })

  if (error) return <div>Error: {error.message}</div>
  if (isLoading) return <div>Loading...</div>

  if (avatar)
    return (
      <img
        src={avatar}
        alt="avatar"
        className={`w-[${width}] h-[${height}] rounded-lg`}
      />
    )
  return null
}
