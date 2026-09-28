import type { QueryClient } from '@tanstack/react-query'
import type { useNavigate } from '@tanstack/react-router'
import {
  ALL_ELIGIBLE_PRESET,
  NO_MANAGER_RESTORATION_PRESET,
} from '@/features/migration/components/migrationAiPreset'
import { getPreferenceSession } from '@/features/notifications/services/preferenceSession'
import { profileOwnerQuery } from '@/features/profile/service/profileOwner'
import { getRegistrationV2AvailabilityQueryOptions } from '@/features/register-v2/data/queries/availability.query'
import {
  type ManagerActionContext,
  openManagerAction,
} from './openManagerAction'
import type { PreparedAiAction } from './prepareAiHandoff'

export type AiHandoffContext = ManagerActionContext & {
  readonly isCurrent: () => boolean
  readonly navigate: ReturnType<typeof useNavigate>
  readonly queryClient: QueryClient
  readonly favoriteLabels: ReadonlySet<string>
  readonly addFavorite: (input: { name: string }) => Promise<unknown>
  readonly openPrimary: () => void
  readonly openBulkRenew: () => void
  readonly openProfileEditor: () => void
}

const openRegistration = async (
  action: Extract<PreparedAiAction, { intent: 'register' }>,
  { queryClient, navigate, isCurrent }: AiHandoffContext,
): Promise<string | null> => {
  const availability = await queryClient.fetchQuery({
    ...getRegistrationV2AvailabilityQueryOptions(action.name),
    staleTime: 0,
  })
  if (!isCurrent()) return null
  if (!availability?.isAvailable) {
    return `${action.name} is unavailable for registration.`
  }
  await navigate({
    to: '/register/$name',
    params: { name: action.name },
    search: { durationDays: action.durationDays },
  })
  return null
}

const openRenewal = async (
  action: Extract<PreparedAiAction, { intent: 'renew' }>,
  { queryClient, navigate, isCurrent }: AiHandoffContext,
): Promise<string | null> => {
  const owner = await queryClient.fetchQuery({
    ...profileOwnerQuery(action.name),
    staleTime: 0,
  })
  if (!isCurrent()) return null
  if (!owner?.owner) {
    return 'Manager could not find an active registration for this name.'
  }
  const search =
    action.targetDate === undefined
      ? action.durationYears === undefined
        ? { durationDays: action.durationDays }
        : { durationYears: action.durationYears }
      : { targetDate: action.targetDate }
  if (owner.protocol === 'v1') {
    await navigate({
      to: '/renew-v1/$name',
      params: { name: action.name },
      search,
    })
  } else {
    await navigate({
      to: '/renew/$name',
      params: { name: action.name },
      search,
    })
  }
  return null
}

export const openAiAction = async (
  action: PreparedAiAction,
  context: AiHandoffContext,
): Promise<string | null> => {
  if (!context.isCurrent()) return null
  switch (action.intent) {
    case 'manager_action':
      return openManagerAction(action, context)
    case 'set_primary':
      context.openPrimary()
      return null
    case 'register':
      return openRegistration(action, context)
    case 'renew':
      return openRenewal(action, context)
    case 'find_names':
      return null
    case 'bulk_renew':
      context.openBulkRenew()
      return null
    case 'migrate':
      await context.navigate({
        to: '/migration',
        search: {
          ...(action.excludeManagerRestoration && {
            preset: NO_MANAGER_RESTORATION_PRESET,
          }),
          ...(!action.excludeManagerRestoration &&
            action.allEligible &&
            !action.names && { preset: ALL_ELIGIBLE_PRESET }),
          ...(action.names && { names: [...action.names] }),
        },
      })
      return null
    case 'edit_profile':
      context.openProfileEditor()
      return null
    case 'notification':
      await context.navigate({
        to: '/notifications/settings',
        search: {
          aiPreference: action.preference,
          aiEnabled: action.enabled,
          aiPreferenceSession: getPreferenceSession().id,
        },
      })
      return null
    case 'favorite':
      if (context.favoriteLabels.has(action.name.toLowerCase())) {
        return `${action.name} is already in your favourites.`
      }
      await context.addFavorite({ name: action.name })
      return null
    case 'view_name':
      await context.navigate({ to: '/$name', params: { name: action.name } })
      return null
  }
}
