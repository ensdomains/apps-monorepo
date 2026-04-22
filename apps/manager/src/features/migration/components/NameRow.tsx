import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ClassifiedName } from '../service/classifyNames'

type NameRowProps = {
  readonly item: ClassifiedName
  readonly isSelected: boolean
  readonly indent: boolean
  readonly interactive: boolean
  readonly onClick?: () => void
}

export const NameRow = ({
  item,
  isSelected,
  indent,
  interactive,
  onClick,
}: NameRowProps) => {
  const isSubname = indent && !interactive

  const content = (
    <>
      {isSubname ? (
        <div className="flex h-[37px] w-7 shrink-0 items-start">
          <div className="h-1/2 w-full rounded-bl-[6px] border-ens-garnet-900/30 border-b border-l" />
        </div>
      ) : (
        <div
          className={cn(
            'flex shrink-0 items-center justify-center rounded-[4px] p-1 transition-colors',
            isSelected
              ? 'bg-ens-garnet-900'
              : 'border border-ens-garnet-900/30 bg-transparent',
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
      <div className="flex size-[37px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-ens-garnet-900/10">
        <span className="font-semi-mono text-ens-garnet-900 text-xs">
          {item.domain.labelName?.[0]?.toUpperCase() ?? '?'}
        </span>
      </div>
      <div className="rounded-[2px] border border-[#595755]/40 bg-white px-2 py-1 font-medium font-semi-mono text-[#595755] text-base leading-[0.96] tracking-[-0.32px]">
        {item.domain.name}
      </div>
    </>
  )

  const rowClass = cn(
    'flex items-center gap-3',
    indent && 'pl-8',
    interactive ? 'cursor-pointer' : 'cursor-default',
  )

  if (interactive) {
    return (
      <button
        aria-pressed={isSelected}
        className={rowClass}
        onClick={onClick}
        type="button"
      >
        {content}
      </button>
    )
  }

  return <div className={rowClass}>{content}</div>
}
