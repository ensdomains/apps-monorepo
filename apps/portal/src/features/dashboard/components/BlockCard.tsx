import { cva, type VariantProps } from 'class-variance-authority'
import { ChevronRight } from 'lucide-react'
import { ExternalLink } from 'react-external-link'
import { cn } from '@/lib/utils'

const baseCardClass =
  'group flex flex-col h-[212px] w-full rounded-sm p-[18px] transition-colors'

export const InfoBlockCard = ({
  title,
  description,
}: {
  title: string
  description: string
}) => (
  <div
    className={cn(
      baseCardClass,
      'bg-secondary dark:bg-accent gap-3 items-start',
    )}
  >
    <p className="font-medium text-base text-foreground leading-snug">
      {title}
    </p>
    <p className="text-base text-muted-foreground leading-snug">
      {description}
    </p>
  </div>
)

const linkCardBorder = cva('border-border dark:border-[#2b2b2b]', {
  variants: {
    hoverColor: {
      lapis: 'hover:border-lapis-500 dark:hover:border-lapis-400',
      peridot: 'hover:border-peridot-500 dark:hover:border-peridot-400',
      garnet: 'hover:border-garnet-500 dark:hover:border-garnet-500',
    },
  },
})

const linkCardTitle = cva('text-muted-foreground', {
  variants: {
    hoverColor: {
      lapis: 'group-hover:text-lapis-500 dark:group-hover:text-lapis-400',
      peridot: 'group-hover:text-peridot-500 dark:group-hover:text-peridot-400',
      garnet: 'group-hover:text-garnet-500 dark:group-hover:text-garnet-500',
    },
  },
})

const linkCardChevronBg = cva('bg-secondary dark:bg-accent', {
  variants: {
    hoverColor: {
      lapis: 'group-hover:bg-lapis-100 dark:group-hover:bg-lapis-900',
      peridot: 'group-hover:bg-peridot-100 dark:group-hover:bg-peridot-900',
      garnet: 'group-hover:bg-garnet-100 dark:group-hover:bg-garnet-900',
    },
  },
})

const linkCardChevronIcon = cva('text-muted-foreground/40', {
  variants: {
    hoverColor: {
      lapis: 'group-hover:text-lapis-500 dark:group-hover:text-lapis-400',
      peridot: 'group-hover:text-peridot-500 dark:group-hover:text-peridot-400',
      garnet: 'group-hover:text-garnet-500 dark:group-hover:text-garnet-500',
    },
  },
})

type LinkBlockCardProps = {
  title: string
  description?: string
  href: string
} & VariantProps<typeof linkCardBorder>

export const LinkBlockCard = ({
  title,
  description,
  href,
  hoverColor,
}: LinkBlockCardProps) => (
  <ExternalLink
    href={href}
    className={cn(
      baseCardClass,
      'bg-popover dark:bg-background border items-end justify-between',
      linkCardBorder({ hoverColor }),
    )}
  >
    <div className="flex flex-col gap-7 items-start w-full">
      <p
        className={cn(
          'font-medium text-base leading-snug w-full',
          linkCardTitle({ hoverColor }),
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
        'flex items-center justify-center rounded-xs w-6 h-11.75 shrink-0 self-end transition-colors',
        linkCardChevronBg({ hoverColor }),
      )}
    >
      <ChevronRight
        className={cn(
          'size-4 transition-colors',
          linkCardChevronIcon({ hoverColor }),
        )}
      />
    </div>
  </ExternalLink>
)
