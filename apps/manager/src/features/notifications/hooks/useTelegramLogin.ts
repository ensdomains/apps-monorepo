import {
  resultMutationOptions,
  resultQueryOptions,
} from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSelector } from '@xstate/store-react'
import { useEffect, useState } from 'react'
import {
  cancelTelegramLogin,
  getTelegramLoginPhase,
  getTelegramLoginStatus,
  openTelegramTab,
  startTelegramLogin,
  telegramPollInterval,
} from '@/features/notifications/utils/telegram/login'
import { backendAuthStore, getBackendApiBaseUrl } from '@/utils/backend-client'

export const useTelegramLogin = () => {
  const auth = useSelector(backendAuthStore, (state) => state.context)
  const queryClient = useQueryClient()
  const queryKey = qk('telegram_login', 'current', {
    address: auth.address,
    baseUrl: getBackendApiBaseUrl(),
  })
  const [, setNow] = useState(Date.now)
  const status = useQuery(
    resultQueryOptions({
      queryKey,
      queryFn: ({ signal }) =>
        getTelegramLoginStatus(signal).map((result) => {
          if (result.attempt?.status === 'completed') {
            void queryClient.invalidateQueries({
              queryKey: qk('channels', 'list'),
            })
          }
          return result
        }),
      enabled: Boolean(auth.authKey),
      retry: false,
      staleTime: 0,
      refetchOnWindowFocus: 'always',
      refetchInterval: (query) =>
        telegramPollInterval(query.state.data?.attempt),
      meta: { dependsOn: ['backend'] },
    }),
  )
  const attempt = status.data?.attempt
  const phase = getTelegramLoginPhase(attempt)
  const isPending = phase === 'pending'

  // Render once at the deadline even offline; expiry is derived from server data.
  useEffect(() => {
    if (!attempt || !isPending) return
    const timeout = window.setTimeout(
      () => setNow(Date.now()),
      Math.max(0, new Date(attempt.expires_at).getTime() - Date.now()),
    )
    return () => window.clearTimeout(timeout)
  }, [attempt, isPending])

  const start = useMutation(
    resultMutationOptions({
      mutationFn: startTelegramLogin,
      onSuccess: async (result) => {
        // A status request started before initiation must not overwrite pending.
        await queryClient.cancelQueries({ queryKey })
        queryClient.setQueryData(queryKey, {
          attempt: {
            id: result.id,
            status: 'pending',
            expires_at: result.expires_at,
          },
        })
      },
    }),
  )
  const cancel = useMutation(
    resultMutationOptions({
      mutationFn: cancelTelegramLogin,
      onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    }),
  )
  return {
    attempt,
    isPending,
    isExpired: phase === 'expired',
    isStarting: start.isPending,
    isCancelling: cancel.isPending,
    startError: phase === 'completed' ? null : start.error,
    cancelError: isPending ? cancel.error : null,
    statusError: status.error,
    // Keep an explicit user-activated link available for mobile/popup blockers.
    authorizationUrl:
      isPending && start.data && start.data.id === attempt?.id
        ? start.data.authorizationUrl
        : undefined,
    connect: () => {
      cancel.reset()
      start.mutate(openTelegramTab())
    },
    cancel: () => {
      if (attempt) cancel.mutate(attempt.id)
    },
  }
}
