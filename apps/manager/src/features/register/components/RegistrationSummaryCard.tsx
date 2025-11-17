import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type RegistrationSummaryCardProps = {
  header?: ReactNode
  children: ReactNode
  footer?: ReactNode
  className?: string
  bodyClassName?: string
}

export const RegistrationSummaryCard = ({
  header,
  children,
  footer,
  className,
  bodyClassName,
}: RegistrationSummaryCardProps) => {
  return (
    <div className="relative z-10 flex w-full justify-center">
      <div
        className={cn(
          'registration-summary-card',
          'w-full',
          'max-w-4xl',
          'rounded-sm',
          'border',
          'border-slate-200',
          'bg-gradient-to-b',
          'from-white',
          'via-white',
          'to-slate-50',
          'p-8',
          'shadow-2xl',
          className,
        )}
      >
        {header}

        <div className={cn('mt-8 space-y-8', bodyClassName)}>{children}</div>

        {footer && <div className="mt-8">{footer}</div>}
      </div>
    </div>
  )
}
