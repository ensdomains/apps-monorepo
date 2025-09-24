import { useEnsAvatar } from 'wagmi'

export const NameAvatar = ({ name }: { name: string }) => {
  const { data: avatar, error, isLoading } = useEnsAvatar({ name })

  if (error) return <div>Error: {error.message}</div>
  if (isLoading) return <div>Loading...</div>

  if (avatar)
    return (
      <img
        src={avatar}
        alt="avatar"
        className="w-[138px] h-[138px] rounded-lg"
      />
    )
  return null
}
