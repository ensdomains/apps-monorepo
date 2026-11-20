import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'
import { UnreadDot } from '../notifications/UnreadBadge'
import { AccountTriggerContent } from './AccountTriggerContent'

export const AccountTriggerButton = ({
  className,
  ...props
}: ComponentProps<'button'>) => {
  return (
    <button
      className={cn('group relative flex items-center gap-2', className)}
      type="button"
      {...props}
    >
      <AccountTriggerContent />
      <UnreadDot className="-ml-2 self-start" />
    </button>
  )
}
