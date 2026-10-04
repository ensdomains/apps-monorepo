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
import { getParentName, isEthSecondLevelName } from '#utils/ensName.js'
import { encodeNamePathSegment, normalizeNotificationName } from './sanitize.js'

export type NameExpiryPayload = PersonalNotificationPayloads['name-expiry']

export type NameExpiryRenderOptions = {
  managerAppUrl: string
  now?: Date
}

/**
 * What a notice says. A subname (any name but a `.eth` second-level name) has
 * no grace, and the Manager cannot renew it: normally only the owner of its
 * parent can extend it. Its notices name that parent and link to the name's
 * profile instead of offering a renewal.
 */
export type NameExpiryNotice =
  | { kind: Exclude<NameExpiryNoticeKind, 'expired'> }
  | { kind: 'subname-pre-expiry' | 'subname-expired'; parentName: string }

export type NameExpiryDeliveryContext = {
  name: string
  stage: NameExpiryPayload['stage']
  notice: NameExpiryNotice
  expiryDate: Date
  graceEndDate: Date
  daysUntilExpiry: number
  daysUntilGraceEnd: number
  renewPath: string
  registerPath: string
  renewUrl: string
  registerUrl: string
  profilePath: string
  profileUrl: string
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

const toNotice = (
  name: string,
  kind: NameExpiryNoticeKind,
): NameExpiryNotice => {
  const parentName = getParentName(name)
  if (!isEthSecondLevelName(name) && parentName !== undefined) {
    return kind === 'pre-expiry'
      ? { kind: 'subname-pre-expiry', parentName }
      : { kind: 'subname-expired', parentName }
  }
  // Only names with no grace are sent `expired`; a `.eth` name's expiry starts
  // its grace.
  return { kind: kind === 'expired' ? 'grace-start' : kind }
}

export const buildNameExpiryDeliveryContext = (
  payload: NameExpiryPayload,
  options: NameExpiryRenderOptions,
): NameExpiryDeliveryContext => {
  const now = options.now ?? new Date()
  const expiryDate = new Date(payload.expiryDate)
  const graceEndDate =
    payload.graceEndDate === undefined
      ? getGraceEndDate(expiryDate, 'v2')
      : new Date(payload.graceEndDate)
  const name = normalizeNotificationName(payload.name)
  const nameSegment = encodeNamePathSegment(name)
  const renewPath = `/renew/${nameSegment}`
  const registerPath = `/register/${nameSegment}`
  const profilePath = `/${nameSegment}`

  return {
    name,
    stage: payload.stage,
    notice: toNotice(
      name,
      payload.stage
        ? nameExpiryNoticeKindFromStage(payload.stage)
        : fallbackNoticeKind(payload, now),
    ),
    expiryDate,
    graceEndDate,
    daysUntilExpiry: daysUntilDate(expiryDate, now),
    daysUntilGraceEnd: daysUntilDate(graceEndDate, now),
    renewPath,
    registerPath,
    renewUrl: new URL(renewPath, options.managerAppUrl).toString(),
    registerUrl: new URL(registerPath, options.managerAppUrl).toString(),
    profilePath,
    profileUrl: new URL(profilePath, options.managerAppUrl).toString(),
  }
}

export const formatCalendarDate = (date: Date): string =>
  date.toLocaleDateString()

export const formatDayCount = (days: number): string => {
  const remaining = Math.max(days, 0)
  return `${remaining} day${remaining === 1 ? '' : 's'}`
}
