import type { UserNotificationSettings } from '@ens-apps/shared-schema/notifications'
import { $qk, qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { mutationOptions, queryOptions } from '@tanstack/react-query'
import type { PreferenceSession } from '@/features/notifications/services/preferenceSession'
import { getPreferenceChanges } from '@/features/notifications/settings/preferenceProposal'
import { backendClient } from '@/utils/backend-client'

const readPreferences = async (session: PreferenceSession) => {
  session.assertCurrent()
  const response = await backendClient.notifications.preferences.$get()
  session.assertCurrent()
  if (!response.ok) {
    throw new Error(`Failed to fetch preferences: ${response.statusText}`)
  }
  const data = await response.json()
  session.assertCurrent()
  return data
}

export const getPreferencesQueryOptions = (session: PreferenceSession) =>
  queryOptions({
    queryKey: qk('preferences', 'list', { session: session.id }),
    queryFn: () => readPreferences(session),
    enabled: session.authenticated,
    refetchOnMount: 'always',
    meta: {
      dependsOn: ['backend'],
    },
  })

export const getPreferenceChannelsQueryOptions = (session: PreferenceSession) =>
  queryOptions({
    queryKey: qk('channels', 'list', { session: session.id }),
    enabled: session.authenticated,
    queryFn: async () => {
      session.assertCurrent()
      const response = await backendClient.notifications.channels.$get()
      session.assertCurrent()
      if (!response.ok) throw new Error('Contact methods could not be checked.')
      const data = await response.json()
      session.assertCurrent()
      return data
    },
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
    refetchInterval: (query) =>
      query.state.data?.some(({ status }) => status === 'pending')
        ? 5_000
        : false,
  })

export const updatePreferenceMutationOptions = mutationOptions({
  mutationFn: async ({
    session,
    baseline,
    values,
  }: {
    readonly session: PreferenceSession
    readonly baseline: UserNotificationSettings
    readonly values: UserNotificationSettings
  }) => {
    session.assertCurrent()
    const changes = getPreferenceChanges(baseline, values)
    const latest = await readPreferences(session)
    if (latest.verifiedChannels.length === 0)
      throw new Error('Verify at least one contact method to save preferences.')
    const request = Object.fromEntries(
      Object.entries(changes).filter(
        ([key, value]) =>
          latest.settings[key as keyof UserNotificationSettings] !== value,
      ),
    )
    if (Object.keys(request).length === 0) return { settings: latest.settings }
    session.assertCurrent()
    const response = await backendClient.notifications.preferences.$patch({
      json: request,
    })
    session.assertCurrent()

    if (!response.ok) {
      const error = await response.json()
      throw new Error(
        'error' in error ? error.error : 'Failed to update preference',
      )
    }

    const data = await response.json()
    session.assertCurrent()
    return data
  },
  meta: {
    invalidates: [
      $qk({
        $scope: 'preferences',
      }),
    ],
  },
})
