import type { CSSProperties } from 'react'
import { useEnsAvatar } from 'wagmi'
import { cn } from '@/lib/utils'

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
    query: {
      enabled: name.endsWith('.eth'),
    },
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
  return (
    <div
      style={
        {
          '--height': height,
          '--width': width,
        } as CSSProperties
      }
      className={cn(
        '[background:var(--avatar-placeholder-gradient)]',
        rounded,
        `w-[var(--width)] h-[var(--height)]`,
      )}
    />
  )
}
