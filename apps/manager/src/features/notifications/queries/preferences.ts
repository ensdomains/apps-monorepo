import { $qk, qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { mutationOptions, queryOptions } from '@tanstack/react-query'
import { backendClient } from '@/utils/backend-client'
import type {
  BatchPreferencesRequest,
  NotificationKind,
  PreferencesResponse,
  PreferenceUpdateRequest,
} from '../types/preferences'

// Queries
export const preferencesQueryOptions = queryOptions({
  queryKey: qk('preferences', 'list'),
  queryFn: async (): Promise<PreferencesResponse> => {
    const response = await backendClient.notifications.preferences.$get()
    if (!response.ok) {
      throw new Error(`Failed to fetch preferences: ${response.statusText}`)
    }
    return response.json()
  },
  meta: {
    dependsOn: ['backend'],
  },
})

export const notificationKindsQueryOptions = queryOptions({
  queryKey: qk('preferences', 'kinds'),
  queryFn: async (): Promise<{
    kinds: NotificationKind[]
    categories: string[]
  }> => {
    const response = await backendClient.notifications.preferences.kinds.$get()
    if (!response.ok) {
      throw new Error(
        `Failed to fetch notification kinds: ${response.statusText}`,
      )
    }
    return response.json()
  },
  meta: {
    dependsOn: ['backend'],
  },
})

// Mutations
export const updatePreferenceMutationOptions = mutationOptions({
  mutationFn: async ({
    kind,
    ...request
  }: { kind: string } & PreferenceUpdateRequest) => {
    const response = await backendClient.notifications.preferences[
      ':kind'
    ].$patch({
      param: { kind },
      json: request,
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(
        'error' in error ? error.error : 'Failed to update preference',
      )
    }

    return response.json()
  },
  meta: {
    invalidates: [
      $qk({
        $scope: 'preferences',
      }),
    ],
  },
})

export const batchUpdatePreferencesMutationOptions = mutationOptions({
  mutationFn: async (preferences: BatchPreferencesRequest) => {
    const response = await backendClient.notifications.preferences.batch.$patch(
      {
        json: preferences,
      },
    )

    if (!response.ok) {
      const error = await response.json()
      throw new Error(
        'error' in error ? error.error : 'Failed to update preferences',
      )
    }

    return response.json()
  },
  meta: {
    invalidates: [
      $qk({
        $scope: 'preferences',
      }),
    ],
  },
})
