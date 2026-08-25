import { Check } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { ClassifiedName } from '../service/classifyNames'
import { getMigrationAvatarUrl } from './nameAvatar.helpers'

type NameRowProps = {
  readonly item: ClassifiedName
  readonly isSelected: boolean
  readonly depth: number
  readonly onClick?: () => void
}

type AvatarStatus = 'loading' | 'loaded' | 'failed'

export const NameRow = ({ item, isSelected, depth, onClick }: NameRowProps) => {
  const [avatarStatus, setAvatarStatus] = useState<AvatarStatus>('loading')
  const avatarUrl = getMigrationAvatarUrl(item.domain.name)
  const isNested = depth > 0

  const avatar = (
    <span
      className={cn(
        'relative flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-ens-garnet-900/10',
        isNested ? 'size-8' : 'size-9',
      )}
    >
      <span className="font-semi-mono text-ens-garnet-900 text-xs">
        {item.label[0]?.toUpperCase() ?? '?'}
      </span>
      {avatarStatus === 'failed' ? null : (
        <img
          alt=""
          aria-hidden
          className={cn(
            'absolute inset-0 size-full rounded-md object-cover transition-opacity duration-150 motion-reduce:transition-none',
            avatarStatus === 'loaded' ? 'opacity-100' : 'opacity-0',
          )}
          onError={() => setAvatarStatus('failed')}
          onLoad={() => setAvatarStatus('loaded')}
          src={avatarUrl}
        />
      )}
    </span>
  )

  const name = (
    <span
      className={cn(
        'min-w-0 truncate font-medium font-semi-mono text-base leading-[0.96] tracking-[-0.32px] transition-colors duration-150 motion-reduce:transition-none md:text-[20px] md:tracking-[-0.4px]',
        isSelected ? 'text-ens-quartz-500' : 'text-ens-lapis-500',
      )}
    >
      {item.domain.name}
    </span>
  )

  if (isNested) {
    return (
      <div
        className="relative z-10 flex min-h-11 max-w-full items-center gap-3 px-2 py-1"
        title={item.domain.name}
      >
        {avatar}
        {name}
      </div>
    )
  }

  return (
    <button
      aria-label={item.domain.name}
      aria-pressed={isSelected}
      className="group relative z-10 flex min-h-11 max-w-full cursor-pointer items-center gap-3 rounded-lg px-2 py-1 text-left outline-none transition-colors duration-150 hover:bg-white/40 focus-visible:ring-2 focus-visible:ring-ens-lapis-500/40 focus-visible:ring-offset-1 active:bg-white/60 motion-reduce:transition-none"
      onClick={onClick}
      title={item.domain.name}
      type="button"
    >
      <span
        className={cn(
          'flex shrink-0 items-center justify-center rounded-full border transition-colors duration-150 motion-reduce:transition-none',
          'size-7 p-1',
          isSelected
            ? 'border-ens-garnet-900 bg-ens-garnet-900'
            : 'border-ens-garnet-900/30 bg-transparent',
        )}
      >
        <Check
          className={cn(
            'transition-opacity duration-150 motion-reduce:transition-none',
            'size-5',
            isSelected
              ? 'text-white opacity-100'
              : 'text-transparent opacity-0',
          )}
          strokeWidth={2.5}
        />
      </span>
      {avatar}
      {name}
    </button>
  )
}
