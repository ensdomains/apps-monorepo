import { Check } from 'lucide-react'
import { memo, useState } from 'react'
import { cn } from '@/lib/utils'
import type { ClassifiedName } from '../service/classifyNames'
import { getMigrationAvatarUrl } from './nameAvatar.helpers'

type NameRowProps = {
  readonly item: ClassifiedName
  readonly isSelected: boolean
  readonly depth: number
  readonly onToggle?: (name: string) => void
}

const NameRowComponent = ({
  item,
  isSelected,
  depth,
  onToggle,
}: NameRowProps) => {
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null)
  const avatarUrl = getMigrationAvatarUrl(item.domain.name)
  const isNested = depth > 0
  const showAvatar = failedAvatarUrl !== avatarUrl

  const content = (
    <>
      {!isNested && (
        <div
          className={cn(
            'flex size-7 shrink-0 items-center justify-center rounded-full border p-1 transition-colors',
            isSelected
              ? 'border-ens-garnet-900 bg-ens-garnet-900'
              : 'border-ens-garnet-900/30 bg-transparent',
          )}
        >
          <Check
            className={cn(
              'size-5 transition-opacity',
              isSelected
                ? 'text-white opacity-100'
                : 'text-transparent opacity-0',
            )}
            strokeWidth={2.5}
          />
        </div>
      )}
      <div className="relative z-10 flex size-9.25 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-ens-garnet-900/10">
        <span className="font-semi-mono text-ens-garnet-900 text-xs">
          {item.domain.labelName?.[0]?.toUpperCase() ?? '?'}
        </span>
        {showAvatar && (
          <img
            alt=""
            aria-hidden
            className="absolute inset-0 size-full rounded-sm object-cover"
            decoding="async"
            loading="lazy"
            onError={() => setFailedAvatarUrl(avatarUrl)}
            src={avatarUrl}
          />
        )}
      </div>
      <div
        className={cn(
          'flex h-9.25 items-center rounded-xs border bg-white px-2 py-1 font-medium font-semi-mono text-base leading-[0.96] tracking-[-0.32px] md:text-[20px] md:tracking-[-0.4px]',
          isSelected
            ? 'border-ens-quartz-500/40 text-ens-quartz-500'
            : 'border-ens-lapis-500 text-ens-lapis-500',
        )}
      >
        {item.domain.name}
      </div>
    </>
  )

  const rowClass = cn(
    'relative flex max-w-full items-center gap-3 outline-none focus-visible:[&>div:first-child]:ring-2 focus-visible:[&>div:first-child]:ring-ens-lapis-500/40 focus-visible:[&>div:first-child]:ring-offset-2',
    isNested ? 'cursor-default' : 'cursor-pointer',
  )

  if (isNested) {
    return (
      <div className={rowClass} title={item.domain.name}>
        {content}
      </div>
    )
  }

  return (
    <button
      aria-label={item.domain.name}
      aria-pressed={isSelected}
      className={rowClass}
      onClick={() => onToggle?.(item.domain.name)}
      title={item.domain.name}
      type="button"
    >
      {content}
    </button>
  )
}

export const NameRow = memo(NameRowComponent)
