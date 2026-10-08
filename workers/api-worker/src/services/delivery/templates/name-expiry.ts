import {
  type NameExpiryNoticeKind,
  nameExpiryNoticeKindFromStage,
  type PersonalNotificationPayloads,
} from '@ens-apps/shared-schema/notifications'
import {
  daysUntilDate,
  getGraceEndDate,
  getNameLifecycleState,
} from '@ens-apps/utils/gracePeriod'
import { encodeNamePathSegment, normalizeNotificationName } from './sanitize.js'

export type NameExpiryPayload = PersonalNotificationPayloads['name-expiry']

export type NameExpiryRenderOptions = {
  managerAppUrl: string
  now?: Date
}

export type NameExpiryDeliveryContext = {
  name: string
  stage: NameExpiryPayload['stage']
  noticeKind: NameExpiryNoticeKind
  expiryDate: Date
  graceEndDate: Date
  daysUntilExpiry: number
  daysUntilGraceEnd: number
  renewPath: string
  registerPath: string
  renewUrl: string
  registerUrl: string
}

const fallbackNoticeKind = (
  payload: NameExpiryPayload,
  now: Date,
): NameExpiryNoticeKind => {
  const state = getNameLifecycleState(new Date(payload.expiryDate), 'v2', now)
  if (state === 'expiring') return 'pre-expiry'
  if (state === 'grace') return 'grace-start'
  return 'premium-start'
}

export const buildNameExpiryDeliveryContext = (
  payload: NameExpiryPayload,
  options: NameExpiryRenderOptions,
): NameExpiryDeliveryContext => {
  const now = options.now ?? new Date()
  const expiryDate = new Date(payload.expiryDate)
  const graceEndDate = getGraceEndDate(expiryDate, 'v2')
  const name = normalizeNotificationName(payload.name)
  const nameSegment = encodeNamePathSegment(name)
  const renewPath = `/renew/${nameSegment}`
  const registerPath = `/register/${nameSegment}`

  return {
    name,
    stage: payload.stage,
    noticeKind: payload.stage
      ? nameExpiryNoticeKindFromStage(payload.stage)
      : fallbackNoticeKind(payload, now),
    expiryDate,
    graceEndDate,
    daysUntilExpiry: daysUntilDate(expiryDate, now),
    daysUntilGraceEnd: daysUntilDate(graceEndDate, now),
    renewPath,
    registerPath,
    renewUrl: new URL(renewPath, options.managerAppUrl).toString(),
    registerUrl: new URL(registerPath, options.managerAppUrl).toString(),
  }
}

export const formatCalendarDate = (date: Date): string =>
  date.toLocaleDateString()

export const formatDayCount = (days: number): string => {
  const remaining = Math.max(days, 0)
  return `${remaining} day${remaining === 1 ? '' : 's'}`
}
