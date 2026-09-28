import * as v from 'valibot'
import { durationSearchSchema } from '@/features/register-v2/utils/durationSearch'
import {
  getTargetDateRenewalDuration,
  isFutureTargetDate,
  parseTargetCalendarDate,
} from '@/features/renew/utils/targetDate'
import { MIN_REGISTER_DURATION_SECONDS } from '@/features/shared/registration/pricing'
import type { BulkRenewName, Selection } from '../types'

export type BulkRenewDurationPrefill = {
  readonly initialDurationDays?: number
  readonly initialDurationYears?: number
  readonly initialTargetDate?: string
}

/** Preserve the requested date for an invalid review without treating it as valid. */
export const getRequestedTargetDateSelection = (
  targetDate: string | undefined,
): Extract<Selection, { kind: 'custom' }> | null => {
  const target = parseTargetCalendarDate(targetDate)
  if (!target) return null
  target.setHours(23, 59, 59, 0)
  return { kind: 'custom', targetMs: target.getTime(), exactTarget: true }
}

export const getBulkRenewTargetDateIssue = (
  targetDate: string,
  names: readonly Pick<BulkRenewName, 'name' | 'currentExpiry'>[],
  now = new Date(),
): string | null => {
  if (!isFutureTargetDate(targetDate, now))
    return 'Choose a valid future renewal date within 100 years.'
  for (const name of names) {
    const result = getTargetDateRenewalDuration(
      targetDate,
      new Date(Number(name.currentExpiry) * 1000),
      MIN_REGISTER_DURATION_SECONDS / 86_400,
      now,
    )
    if (result.status === 'invalid') return `${name.name}: ${result.message}`
  }
  return null
}

export const getBulkRenewDurationPrefill = (
  {
    initialDurationDays,
    initialDurationYears,
    initialTargetDate,
  }: BulkRenewDurationPrefill,
  names: readonly Pick<BulkRenewName, 'name' | 'currentExpiry'>[] = [],
  now = new Date(),
):
  | { readonly status: 'ready'; readonly selection: Selection }
  | { readonly status: 'invalid'; readonly message: string } => {
  if (initialTargetDate !== undefined) {
    if (initialDurationDays !== undefined || initialDurationYears !== undefined)
      return {
        status: 'invalid',
        message: 'Choose either added time or a target renewal date, not both.',
      }
    const issue = getBulkRenewTargetDateIssue(initialTargetDate, names, now)
    const selection = getRequestedTargetDateSelection(initialTargetDate)
    if (issue || !selection)
      return {
        status: 'invalid',
        message: issue ?? 'Choose a valid renewal date.',
      }
    return {
      status: 'ready',
      selection,
    }
  }
  const result = v.safeParse(durationSearchSchema, {
    durationDays: initialDurationDays,
    durationYears: initialDurationYears,
  })
  if (!result.success)
    return {
      status: 'invalid',
      message: `Choose a whole number of at least ${MIN_REGISTER_DURATION_SECONDS / 86_400} days, or whole years, within Manager's duration limit. Use one duration unit.`,
    }
  if (result.output.durationDays !== undefined)
    return {
      status: 'ready',
      selection: { kind: 'days', days: result.output.durationDays },
    }
  return {
    status: 'ready',
    selection: { kind: 'preset', years: result.output.durationYears ?? 1 },
  }
}
