import type { PersonalNotificationPayloads } from '@ens-apps/shared-schema/notifications'
import {
  getGraceEndDate,
  getNameLifecycleState,
} from '@ens-apps/utils/gracePeriod'
import { match } from 'ts-pattern'
import { formatDashboardDate } from '@/features/dashboard/utils'
import { isRenewableName } from '@/features/renew/utils/renewableName'
import {
  getRenewalRoute,
  type RenewalProtocol,
} from '@/features/renew/utils/renewalProtocol'
import { formatExpiryTime, TIME_UNITS } from '@/utils/time'

export type NameExpiryAction = 'renew' | 'register' | 'none'

export type NameExpiryPresentation = {
  description: string
  statusText: string
  action: NameExpiryAction
  actionLabel: string
  renewTo: ReturnType<typeof getRenewalRoute>
}

type NameExpiryPayload = PersonalNotificationPayloads['name-expiry']

const resolveProtocol = (
  protocol: NameExpiryPayload['protocol'],
): RenewalProtocol => protocol ?? 'v2'

const formatCountdownUntil = (targetMs: number, nowMs: number): string => {
  const diff = targetMs - nowMs
  if (diff <= 0) return 'ended'

  if (diff < TIME_UNITS.HOUR) {
    const minutes = Math.max(1, Math.floor(diff / TIME_UNITS.MINUTE))
    return `in ${minutes} min`
  }

  if (diff < TIME_UNITS.DAY) {
    const hours = Math.max(1, Math.floor(diff / TIME_UNITS.HOUR))
    return `in ${hours}h`
  }

  const days = Math.max(1, Math.floor(diff / TIME_UNITS.DAY))
  return `in ${days} day${days > 1 ? 's' : ''}`
}

export const getNameExpiryPresentation = (
  payload: NameExpiryPayload,
  now: Date = new Date(),
): NameExpiryPresentation => {
  const protocol = resolveProtocol(payload.protocol)
  const expiryDate = new Date(payload.expiryDate)
  const lifecycle = getNameLifecycleState(expiryDate, protocol, now)
  const renewTo = getRenewalRoute(protocol)

  if (!isRenewableName(payload.name)) {
    return {
      description: "This name can't be renewed in Manager.",
      statusText: formatExpiryTime(payload.expiryDate).text,
      action: 'none',
      actionLabel: '',
      renewTo,
    }
  }

  return match(lifecycle)
    .with('expiring', () => ({
      description:
        'This name is expiring soon and should be renewed as soon as possible.',
      statusText: formatExpiryTime(payload.expiryDate).text,
      action: 'renew' as const,
      actionLabel: 'Renew Now',
      renewTo,
    }))
    .with('grace', () => {
      const graceEndDate = getGraceEndDate(expiryDate, protocol)
      return {
        description: `This name has expired but can still be renewed until ${formatDashboardDate(graceEndDate)}.`,
        statusText: `Grace ends ${formatCountdownUntil(graceEndDate.getTime(), now.getTime())}`,
        action: 'renew' as const,
        actionLabel: 'Renew Now',
        renewTo,
      }
    })
    .with('premium', () => ({
      description:
        'This name is past its grace period and is available to register.',
      statusText: 'Grace period ended',
      action: 'register' as const,
      actionLabel: 'Register Name',
      renewTo,
    }))
    .exhaustive()
}
