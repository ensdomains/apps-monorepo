import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'
import type { InferResponseType } from 'hono'
import { backendClient } from '@/utils/backend-client'

// export type NotificationsResponse = {
//   notifications: BackendNotification[]
//   nextCursor: string | null
// }

// export type BackendNotification

export type NotificationsResponse = InferResponseType<
  typeof backendClient.notifications.$get
>
export type BackendNotification = NotificationsResponse['notifications'][number]

export const notificationsInfiniteQuery = infiniteQueryOptions({
  queryKey: qk('notifications', 'infinite'),
  queryFn: async ({ pageParam }) => {
    const response = await backendClient.notifications.$get({
      query: {
        cursor: pageParam as string | undefined,
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch notifications: ${response.statusText}`)
    }

    return response.json()
  },
  select: (data) => data.pages.flatMap((page) => page.notifications),
  initialPageParam: undefined as string | undefined,
  getNextPageParam: (lastPage) => lastPage.nextCursor,
  meta: {
    dependsOn: ['backend'],
  },
})

export const unreadCountQuery = queryOptions({
  queryKey: qk('notifications', 'unread-count'),
  queryFn: async () => {
    const response = await backendClient.notifications['unread-count'].$get()
    return response.json()
  },
  meta: {
    dependsOn: ['backend'],
  },
})
