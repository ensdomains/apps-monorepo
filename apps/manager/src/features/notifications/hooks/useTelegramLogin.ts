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
  getTelegramLoginStatus,
  isTelegramPending,
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
  const [expiredId, setExpiredId] = useState<string>()
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

  // This deadline also releases the UI if the network stays unavailable.
  useEffect(() => {
    if (!attempt || !isTelegramPending(attempt)) return
    const timeout = window.setTimeout(
      () => setExpiredId(attempt.id),
      Math.max(0, new Date(attempt.expires_at).getTime() - Date.now()),
    )
    return () => window.clearTimeout(timeout)
  }, [attempt])

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
  const pending = isTelegramPending(attempt) && expiredId !== attempt?.id
  const expired =
    attempt?.status === 'expired' ||
    (attempt &&
      (attempt.status === 'pending' || attempt.status === 'processing') &&
      (!isTelegramPending(attempt) || expiredId === attempt.id))
  return {
    attempt,
    pending,
    expired,
    starting: start.isPending,
    cancelling: cancel.isPending,
    error: start.error ?? cancel.error ?? status.error,
    // Keep an explicit user-activated link available for mobile/popup blockers.
    authorizationUrl:
      pending && start.data && start.data.id === attempt?.id
        ? start.data.authorizationUrl
        : undefined,
    connect: () => start.mutate(openTelegramTab()),
    cancel: () => {
      if (attempt) cancel.mutate(attempt.id)
    },
  }
}
