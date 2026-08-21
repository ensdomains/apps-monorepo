import {
  type NameExpiryNoticeKind,
  nameExpiryNoticeKindFromStage,
  type PersonalNotificationPayloads,
} from '@ens-apps/shared-schema/notifications'
import {
  daysUntilDate,
  type GraceProtocol,
  getGraceEndDate,
  getNameLifecycleState,
  type NameLifecycleState,
} from '@ens-apps/utils/gracePeriod'
import {
  buildManagerAppPathUrl,
  encodeNamePathSegment,
  normalizeNotificationName,
} from './sanitize.js'

export type NameExpiryPayload = PersonalNotificationPayloads['name-expiry']

export type NameExpiryRenderOptions = {
  managerAppUrl: string
  now?: Date
}

export type NameExpiryDeliveryContext = {
  name: string
  protocol: GraceProtocol
  stage: NameExpiryPayload['stage']
  noticeKind: NameExpiryNoticeKind
  lifecycleState: NameLifecycleState
  expiryDate: Date
  graceEndDate: Date
  daysUntilExpiry: number
  daysUntilGraceEnd: number
  renewUrl: string
  registerUrl: string
}

const noticeKindFromLifecycle = (
  lifecycle: NameLifecycleState,
): NameExpiryNoticeKind => {
  if (lifecycle === 'expiring') return 'pre-expiry'
  if (lifecycle === 'grace') return 'grace-start'
  return 'premium-start'
}

export const resolveNameExpiryProtocol = (
  protocol: NameExpiryPayload['protocol'],
): GraceProtocol => protocol ?? 'v2'

export const buildNameExpiryDeliveryContext = (
  payload: NameExpiryPayload,
  options: NameExpiryRenderOptions,
): NameExpiryDeliveryContext => {
  const now = options.now ?? new Date()
  const protocol = resolveNameExpiryProtocol(payload.protocol)
  const expiryDate = new Date(payload.expiryDate)
  const graceEndDate = getGraceEndDate(expiryDate, protocol)
  const lifecycleState = getNameLifecycleState(expiryDate, protocol, now)
  const noticeKind = payload.stage
    ? nameExpiryNoticeKindFromStage(payload.stage)
    : noticeKindFromLifecycle(lifecycleState)
  const name = normalizeNotificationName(payload.name)
  const nameSegment = encodeNamePathSegment(name)

  return {
    name,
    protocol,
    stage: payload.stage,
    noticeKind,
    lifecycleState,
    expiryDate,
    graceEndDate,
    daysUntilExpiry: daysUntilDate(expiryDate, now),
    daysUntilGraceEnd: daysUntilDate(graceEndDate, now),
    renewUrl: buildManagerAppPathUrl(
      options.managerAppUrl,
      `/renew/${nameSegment}`,
    ),
    registerUrl: buildManagerAppPathUrl(
      options.managerAppUrl,
      `/register/${nameSegment}`,
    ),
  }
}

export const formatCalendarDate = (date: Date): string =>
  date.toLocaleDateString()

export const formatDayCount = (days: number): string => {
  const remaining = Math.max(days, 0)
  return `${remaining} day${remaining === 1 ? '' : 's'}`
}

const nameExpiryEmailSubject = (context: NameExpiryDeliveryContext): string => {
  if (context.noticeKind === 'pre-expiry') return 'Domain expiration alert'
  if (context.noticeKind === 'grace-start') return 'Domain grace period started'
  if (context.noticeKind === 'grace-ending')
    return 'Domain grace period ending soon'
  return 'Domain grace period ended'
}

export const buildNameExpiryEmailContent = (
  payload: NameExpiryPayload,
  options: NameExpiryRenderOptions,
) => {
  const context = buildNameExpiryDeliveryContext(payload, options)
  return {
    dynamicData: {
      // Pass the raw name. SendGrid Handlebars `{{name}}` HTML-escapes it;
      // pre-escaping would double-encode, and values are not re-parsed as templates.
      name: context.name,
      expiryDate: formatCalendarDate(context.expiryDate),
      protocol: context.protocol,
      stage: context.stage,
      graceEndDate: formatCalendarDate(context.graceEndDate),
      lifecycleState: context.lifecycleState,
      daysUntilExpiry: context.daysUntilExpiry,
      daysUntilGraceEnd: context.daysUntilGraceEnd,
      renewUrl: context.renewUrl,
      registerUrl: context.registerUrl,
      // Kept for the currently deployed SendGrid template until it is updated.
      expiryDays: context.daysUntilExpiry,
      isOwner: payload.watchReason === 'owned',
      watchReason: payload.watchReason,
    },
    subject: nameExpiryEmailSubject(context),
  }
}
