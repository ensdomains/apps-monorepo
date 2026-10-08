import {
  CheckCircle2,
  CircleDashed,
  TriangleAlert,
  XCircle,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { CheckStatus } from '../types'

const STATUS_ICONS = {
  pass: CheckCircle2,
  warn: TriangleAlert,
  fail: XCircle,
  skip: CircleDashed,
} as const

const STATUS_TEXT_CLASS: Readonly<Record<CheckStatus, string>> = {
  pass: 'text-message-success-text',
  warn: 'text-message-warning-text',
  fail: 'text-message-danger-text',
  skip: 'text-muted-foreground',
}

export const STATUS_FILL_CLASS: Readonly<Record<CheckStatus, string>> = {
  pass: 'bg-message-success-fill',
  warn: 'bg-message-warning-fill',
  fail: 'bg-message-danger-fill',
  skip: 'bg-neutral-2',
}

const STATUS_LABEL: Readonly<Record<CheckStatus, string>> = {
  pass: 'Passed',
  warn: 'Warning',
  fail: 'Failed',
  skip: 'Not checked',
}

export const StatusIcon = ({
  status,
  className,
}: {
  readonly status: CheckStatus
  readonly className?: string
}) => {
  const Icon = STATUS_ICONS[status]
  return (
    <Icon
      role="img"
      aria-label={STATUS_LABEL[status]}
      className={cn('size-4 shrink-0', STATUS_TEXT_CLASS[status], className)}
      strokeWidth={1.75}
    />
  )
}

const BADGE_VARIANT = {
  pass: 'success',
  warn: 'warning',
  fail: 'danger',
  skip: 'outline',
} as const

export const StatusBadge = ({
  status,
  children,
  className,
}: {
  readonly status: CheckStatus
  readonly children: string
  readonly className?: string
}) => (
  <Badge variant={BADGE_VARIANT[status]} className={className}>
    {children}
  </Badge>
)
