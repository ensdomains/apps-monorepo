import { readDetailChoice } from './actionDetails'
import type { NotificationTag } from './managerActions'

type NotificationRequest = {
  readonly operation?: 'show_notifications' | 'mark_notifications_read'
  readonly tag?: NotificationTag | 'missing'
  readonly unread?: 'yes' | 'no'
  readonly complete: boolean
}

const categoryPatterns: readonly [NotificationTag, RegExp][] = [
  ['expiry', /\b(?:expiry|expiration|expirations|expiring)\b/gi],
  ['updates', /\b(?:ens\s+)?(?:updates?|news)\b/gi],
  ['education', /\b(?:education|educational|blog\s+posts?)\b/gi],
  ['onboarding', /\b(?:onboarding|welcome)\b/gi],
  ['transfer', /\b(?:transfers?|transferred)\b/gi],
]
const unsupportedSelection =
  /\b(?:except|excluding|exclude|without|not|but|containing|mentioning|matching|titled|historical|unloaded|today|tomorrow|yesterday|recently|recent|oldest|newest|older|newer|before|after|since|between|during)\b|\b(?:last|past|next|previous|this)\s+(?:\d+\s+)?(?:day|week|month|year)s?\b|\b\d+\b/i
const readOnlySelection =
  /\b(?:already[\s-]+read|read[\s-]+only|(?:only\s+)?read\s+(?:notifications?|alerts?|messages?))\b/i
const requestWords =
  /\b(?:please|can|could|would|you|help|me|mark|show|view|open|see|list|display|check|clear|the|a|an|my|our|all|only|just|currently|loaded|unread|read|notifications?|alerts?|messages?|inbox|as|to|of|in|for|from|about|status|one|some|specific|particular|category|categories|type|kind|these|those)\b/gi

const getNotificationOperation = (
  instruction: string,
): NotificationRequest['operation'] | 'mixed' => {
  const marksRead =
    (/\bmark\b/i.test(instruction) && /\bread\b/i.test(instruction)) ||
    /\bclear\b.*\bunread\s+(?:status|state|markers?|badges?)\b/i.test(
      instruction,
    )
  const showsInbox = /\b(?:show|view|open|see|list|display|check)\b/i.test(
    instruction,
  )
  if (marksRead && showsInbox) return 'mixed'
  if (marksRead) return 'mark_notifications_read'
  return showsInbox ? 'show_notifications' : undefined
}

const hasUnsupportedReadOperation = (instruction: string): boolean => {
  if (!/\b(?:mark|clear)\b/i.test(instruction)) return false
  if (
    /\b(?:as|to)\s+(?:unread|unseen)\b|\b(?:unread|unseen)\s*[.!?]*$/i.test(
      instruction,
    )
  )
    return true
  const operation = getNotificationOperation(instruction)
  return (
    /\b(?:mark|clear)\b/i.test(instruction) &&
    operation !== 'mark_notifications_read'
  )
}

/** Literal constraints remain authoritative when the model supplies a different scope. */
export const inspectNotificationRequest = (
  query: string,
): NotificationRequest | null => {
  const instruction = query
    .toLowerCase()
    .replace(/\b(?:not(?:\s+yet)?|haven['’]t)\s+(?:been\s+)?read\b/g, 'unread')
  if (
    hasUnsupportedReadOperation(instruction) ||
    unsupportedSelection.test(instruction) ||
    readOnlySelection.test(instruction)
  )
    return null
  const matched = categoryPatterns.filter(([, pattern]) =>
    new RegExp(pattern.source, 'i').test(instruction),
  )
  if (matched.length > 1) return null
  const withoutCategories = categoryPatterns.reduce(
    (text, [, pattern]) => text.replace(pattern, ''),
    instruction,
  )
  const residual = withoutCategories
    .replace(requestWords, '')
    .replace(/[\s.!?,;:'"“”‘’()-]/g, '')
  const hasOperation =
    /\b(?:mark|show|view|open|see|list|display|check|clear)\b/i.test(
      instruction,
    )
  const complete = hasOperation && residual.length === 0
  const operation = getNotificationOperation(instruction)
  if (operation === 'mixed') return null
  const missingCategory =
    matched.length === 0 &&
    /\b(?:one|a|some|specific|particular)\s+(?:category|type|kind)\b/i.test(
      instruction,
    )
  return {
    operation,
    tag:
      matched[0]?.[0] ??
      (missingCategory ? 'missing' : complete ? 'all' : undefined),
    unread: /\bunread\b/i.test(instruction)
      ? 'yes'
      : complete
        ? 'no'
        : undefined,
    complete,
  }
}

const readMatchingEvidence = <T extends string>(
  answer: unknown,
  expected: T,
): T | null => {
  if (!answer || typeof answer !== 'object') return null
  const record = answer as Record<string, unknown>
  return record.type === 'choice' &&
    record.choice === expected &&
    typeof record.confidence === 'number' &&
    Number.isFinite(record.confidence) &&
    record.confidence >= 0 &&
    record.confidence <= 1
    ? expected
    : null
}

export const readNotificationFacet = <T extends string>(
  answers: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  expected: T | undefined,
  complete: boolean,
): T | null => {
  const interpreted = readDetailChoice(answers, key, allowed)
  if (expected === undefined) return interpreted
  if (complete) return readMatchingEvidence(answers[key], expected)
  return interpreted === expected ? interpreted : null
}

export const readNotificationUnread = (
  kind: 'show_notifications' | 'mark_notifications_read',
  answers: Record<string, unknown>,
  request: NotificationRequest,
): 'yes' | 'no' | null => {
  // Mark-as-read already changes only unread items. An uncertain "no extra
  // unread filter" is metadata, not a reason to drop a valid category request.
  if (
    kind === 'mark_notifications_read' &&
    request.unread !== 'yes' &&
    readMatchingEvidence(answers.manager_unread, 'no') === 'no'
  )
    return 'no'
  return readNotificationFacet(
    answers,
    'manager_unread',
    ['yes', 'no'],
    request.unread,
    request.complete,
  )
}

export const hasCompleteNotificationRequest = (
  query: string,
  answers: Record<string, unknown>,
): boolean =>
  inspectNotificationRequest(query)?.complete === true &&
  readMatchingEvidence(answers.manager_constraints, 'represented') ===
    'represented'
