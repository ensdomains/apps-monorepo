import { ChevronRight } from 'lucide-react'
import { ExternalLink } from 'react-external-link'
import { cn } from '@/lib/utils'

const baseCardClass =
  'group flex flex-col h-[212px] w-[174px] rounded-lg p-[18px] shrink-0 transition-colors'

export const InfoBlockCard = ({
  title,
  description,
}: {
  title: string
  description: string
}) => (
  <div className={cn(baseCardClass, 'bg-secondary gap-3 items-start')}>
    <p className="font-medium text-base text-foreground leading-snug">
      {title}
    </p>
    <p className="text-base text-muted-foreground leading-snug">
      {description}
    </p>
  </div>
)

type HoverColor = 'lapis' | 'peridot' | 'garnet'

const colorConfig: Record<
  HoverColor,
  {
    border: string
    title: string
    chevronBg: string
    chevronIcon: string
  }
> = {
  lapis: {
    border: 'border-border hover:border-lapis-500 dark:hover:border-lapis-400',
    title:
      'text-muted-foreground group-hover:text-lapis-500 dark:group-hover:text-lapis-400',
    chevronBg:
      'bg-secondary dark:bg-accent group-hover:bg-lapis-100 dark:group-hover:bg-lapis-900',
    chevronIcon:
      'text-muted-foreground/40 group-hover:text-lapis-500 dark:group-hover:text-lapis-400',
  },
  peridot: {
    border:
      'border-border hover:border-peridot-500 dark:hover:border-peridot-400',
    title:
      'text-muted-foreground group-hover:text-peridot-500 dark:group-hover:text-peridot-400',
    chevronBg:
      'bg-secondary dark:bg-accent group-hover:bg-peridot-100 dark:group-hover:bg-peridot-900',
    chevronIcon:
      'text-muted-foreground/40 group-hover:text-peridot-500 dark:group-hover:text-peridot-400',
  },
  garnet: {
    border:
      'border-border hover:border-garnet-500 dark:hover:border-garnet-500',
    title:
      'text-muted-foreground group-hover:text-garnet-500 dark:group-hover:text-garnet-500',
    chevronBg:
      'bg-secondary dark:bg-accent group-hover:bg-garnet-100 dark:group-hover:bg-garnet-900',
    chevronIcon:
      'text-muted-foreground/40 group-hover:text-garnet-500 dark:group-hover:text-garnet-500',
  },
}

export const LinkBlockCard = ({
  title,
  description,
  href,
  hoverColor,
}: {
  title: string
  description?: string
  href: string
  hoverColor: HoverColor
}) => {
  const colors = colorConfig[hoverColor]

  return (
    <ExternalLink
      href={href}
      className={cn(
        baseCardClass,
        'bg-popover dark:bg-card border items-end justify-between',
        colors.border,
      )}
    >
      <div className="flex flex-col gap-7 items-start w-full">
        <p
          className={cn(
            'font-medium text-base leading-snug w-full',
            colors.title,
          )}
        >
          {title}
        </p>
        {description && (
          <p className="text-sm text-muted-foreground leading-snug w-full">
            {description}
          </p>
        )}
      </div>
      <div
        className={cn(
          'flex items-center justify-center rounded-xs size-7 shrink-0 self-end transition-colors',
          colors.chevronBg,
        )}
      >
        <ChevronRight
          className={cn('size-4 transition-colors', colors.chevronIcon)}
        />
      </div>
    </ExternalLink>
  )
}
