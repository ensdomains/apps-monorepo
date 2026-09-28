import type { SmartNameFilters } from '@/features/dashboard/smartNameSearch'
import {
  getProfileFieldDefinition,
  getProfileNetwork,
} from '@/features/profile/service/profileFieldRegistry'
import { LOCALES } from '@/lib/locales.config'
import type { AiAction, AiInterpretResult } from './intent'
import { getManagerActionTitle, type ManagerAction } from './managerActions'

export type AiConfirmationContext = {
  readonly revision: number
  readonly walletAddress?: string
  readonly authAddress?: string
  readonly authToken?: string
  readonly apiBaseUrlOverride?: string
}

export const isAiConfirmationCurrent = (
  expected: AiConfirmationContext | null,
  current: AiConfirmationContext,
): boolean =>
  !!expected?.walletAddress &&
  !!expected.authToken &&
  !!expected.authAddress &&
  expected.walletAddress.toLowerCase() === expected.authAddress.toLowerCase() &&
  expected.revision === current.revision &&
  expected.walletAddress.toLowerCase() ===
    current.walletAddress?.toLowerCase() &&
  expected.authAddress.toLowerCase() === current.authAddress?.toLowerCase() &&
  expected.authToken === current.authToken &&
  expected.apiBaseUrlOverride === current.apiBaseUrlOverride

/** Confirm only interpretation; native preparation and user review still follow. */
export const confirmAiInterpretation = (
  result: AiInterpretResult | null,
  expected: AiConfirmationContext | null,
  current: AiConfirmationContext,
): Extract<AiInterpretResult, { status: 'ok' }> | null => {
  if (
    result?.status !== 'needs_confirmation' ||
    !isAiConfirmationCurrent(expected, current)
  )
    return null
  return {
    status: 'ok',
    action: result.action,
    ...(result.multiAction && { multiAction: result.multiAction }),
  }
}

type ConfirmationRow = { readonly label: string; readonly value: string }
type ConfirmationSummary = {
  readonly title: string
  readonly rows: readonly ConfirmationRow[]
}
const row = (label: string, value: string): ConfirmationRow => ({
  label,
  value,
})
const targetRows = (action: AiAction): readonly ConfirmationRow[] => {
  if ('name' in action && action.name) return [row('Name', action.name)]
  if (action.nameCandidates?.length)
    return [row('Choose a name next', action.nameCandidates.join(' or '))]
  return []
}

const filterLabels = (filters: SmartNameFilters): readonly string[] => {
  const labels: string[] = []
  if (filters.expiry)
    labels.push(
      filters.expiry === 'expiring'
        ? `Expiring within ${filters.withinDays ?? 30} days`
        : {
            active: 'Active',
            expired: 'Expired',
            'in-grace': 'In grace',
            'past-grace': 'Past grace',
            'non-expiring': 'Non-expiring',
          }[filters.expiry],
    )
  if (filters.role)
    labels.push({ owner: 'Owner', manager: 'Manager' }[filters.role])
  if (filters.version)
    labels.push({ v1: 'ENSv1', v2: 'ENSv2' }[filters.version])
  if (filters.upgrade)
    labels.push(
      {
        eligible: 'Eligible for upgrade',
        ineligible: 'Not eligible for upgrade',
      }[filters.upgrade],
    )
  if (filters.favorite)
    labels.push({ yes: 'Favourites', no: 'Not favourites' }[filters.favorite])
  if (filters.primary)
    labels.push({ yes: 'Primary name', no: 'Not primary' }[filters.primary])
  if (filters.sort)
    labels.push(
      {
        'name-asc': 'Alphabetical order',
        'name-desc': 'Reverse alphabetical order',
        'created-asc': 'Oldest creation first',
        'created-desc': 'Newest creation first',
        'expiry-asc': 'Earliest expiry first',
        'expiry-desc': 'Latest expiry first',
      }[filters.sort],
    )
  return labels
}

const durationRows = (
  action: Extract<
    AiAction,
    { intent: 'register' | 'renew' | 'bulk_renew' | 'find_names' }
  >,
): readonly ConfirmationRow[] => {
  if ('targetDate' in action && action.targetDate)
    return [row('Target expiry date (end of local day)', action.targetDate)]
  const value =
    action.intent !== 'register' && action.durationYears !== undefined
      ? `${action.durationYears} years`
      : action.durationDays === undefined
        ? action.durationAmount === undefined
          ? 'Choose in the next step'
          : `${action.durationAmount} (choose the unit next)`
        : `${action.durationDays} days`
  return [
    row(
      action.intent === 'register'
        ? 'Registration duration'
        : 'Additional time',
      value,
    ),
  ]
}

const managerRows = (action: ManagerAction): readonly ConfirmationRow[] => {
  const rows: ConfirmationRow[] = [...targetRows(action)]
  if (action.address) rows.push(row('Wallet', action.address))
  if (action.ownWallet) rows.push(row('Wallet', 'Your connected wallet'))
  if (action.email) rows.push(row('Email', action.email))
  if (action.approval)
    rows.push(
      row(
        'Permission',
        {
          'eth-registry:hca':
            'Temporary smart account access to the ENSv2 registry',
          'base-registrar:hca': 'Unwrapped ENSv1 .eth name access',
          'name-wrapper:hca': 'Wrapped ENSv1 name access',
        }[action.approval],
      ),
    )
  if (action.locale) rows.push(row('Language', LOCALES[action.locale]))
  if (action.notificationTag)
    rows.push(
      row(
        'Category',
        action.notificationTag === 'all'
          ? 'All categories'
          : action.notificationTag,
      ),
    )
  if (action.notificationTagRequested)
    rows.push(row('Category', 'Choose in the next step'))
  if (action.kind === 'show_notifications')
    rows.push(
      row('Messages', action.unreadOnly ? 'Unread only' : 'Read and unread'),
    )
  if (action.kind === 'mark_notifications_read')
    rows.push(row('Messages', 'Currently loaded unread notifications'))
  if (action.shareTarget)
    rows.push(
      row(
        'Share using',
        { x: 'X', telegram: 'Telegram', link: 'Copy link' }[action.shareTarget],
      ),
    )
  return rows
}

const profileSummary = (
  action: Extract<AiAction, { intent: 'edit_profile' }>,
): ConfirmationSummary => {
  const field =
    action.field === 'address'
      ? `${action.addressCoinType === undefined ? 'Network' : (getProfileNetwork(action.addressCoinType)?.name ?? 'Network')} address`
      : action.field
        ? (getProfileFieldDefinition(action.field)?.label ?? action.field)
        : undefined
  return {
    title: 'Edit a profile',
    rows: [
      ...targetRows(action),
      row('Section', action.section),
      ...(field ? [row('Field', field)] : []),
      ...(action.operation
        ? [row('Change', action.operation.replaceAll('_', ' '))]
        : []),
      ...(action.value === undefined ? [] : [row('New value', action.value)]),
      ...(action.expectedValue === undefined
        ? []
        : [row('Replace only if currently', action.expectedValue)]),
      ...(action.linkTarget ? [row('Existing link', action.linkTarget)] : []),
      ...(action.linkName ? [row('Link title', action.linkName)] : []),
    ],
  }
}

const notificationSummary = (
  action: Extract<AiAction, { intent: 'notification' }>,
): ConfirmationSummary => {
  return {
    title:
      action.enabled === undefined
        ? 'Change a notification preference'
        : action.enabled
          ? 'Turn on notifications'
          : 'Turn off notifications',
    rows: [
      row(
        'Preference',
        action.preference
          ? {
              favouritedNameExpiry: 'Favourite name expiry reminders',
              ownedNameExpiry: 'Owned name expiry reminders',
              ensLabsUpdates: 'ENS Labs updates',
            }[action.preference]
          : 'Choose in the next step',
      ),
    ],
  }
}

/** This local summary contains private values and must never be sent to Jev. */
export const getAiConfirmationSummary = (
  action: AiAction,
): ConfirmationSummary => {
  const rows = targetRows(action)
  switch (action.intent) {
    case 'manager_action':
      return { title: getManagerActionTitle(action), rows: managerRows(action) }
    case 'set_primary':
      return { title: 'Set a primary name', rows }
    case 'favorite':
      return { title: 'Add a name to favourites', rows }
    case 'view_name':
      return { title: 'Open a name profile', rows }
    case 'register':
    case 'renew':
      return {
        title:
          action.intent === 'register' ? 'Register a name' : 'Renew a name',
        rows: [...rows, ...durationRows(action)],
      }
    case 'find_names':
    case 'bulk_renew':
      return {
        title:
          action.intent === 'find_names'
            ? 'Find your names'
            : 'Renew selected names',
        rows: [
          row(
            'Names',
            action.names?.join(', ') ??
              (action.referencedSelection
                ? 'Your previous selection'
                : 'Your loaded wallet names'),
          ),
          ...filterLabels(action.filters).map((value) => row('Filter', value)),
          ...(action.intent === 'bulk_renew' ? durationRows(action) : []),
        ],
      }
    case 'migrate':
      return {
        title: 'Upgrade eligible ENSv1 names',
        rows: [
          row('Names', action.names?.join(', ') ?? 'Eligible ENSv1 names'),
          ...(action.excludeManagerRestoration
            ? [row('Exclude', 'Names needing manager restoration')]
            : []),
        ],
      }
    case 'notification':
      return notificationSummary(action)
    case 'edit_profile':
      return profileSummary(action)
  }
}
