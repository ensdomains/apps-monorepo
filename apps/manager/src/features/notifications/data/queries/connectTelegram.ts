import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { mutationOptions } from '@tanstack/react-query'
import { captureNotificationSession } from '@/features/notifications/services/backendSession'
import { loginWithTelegramPopup } from '@/features/notifications/utils/telegram/auth'
import { backendClient } from '@/utils/backend-client'

export const connectTelegramChannelMutationOptions = mutationOptions({
  mutationFn: async () => {
    const session = captureNotificationSession()
    try {
      session.assertCurrent()
      const authData = await loginWithTelegramPopup({ requestAccess: 'write' })
      // Hook-level success callbacks survive unmount. Check immediately before
      // posting, so closing an old wallet's review cannot affect a new login.
      session.assertCurrent()
      const response =
        await backendClient.notifications.channels.telegram.$post({
          json: { auth_data: authData },
        })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(
          'error' in error ? error.error : 'Failed to add Telegram channel',
        )
      }
      return response.json()
    } finally {
      session.dispose()
    }
  },
  meta: { invalidates: [qk('channels', 'list')] },
})
