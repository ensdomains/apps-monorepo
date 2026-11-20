import { useAnalyticsView } from '@ens-apps/utils/posthog/useAnalyticsView'
import posthog from 'posthog-js/dist/module.full.no-external'
import { useCallback } from 'react'
import { useConnection } from 'wagmi'
import type { Actor } from 'xstate'
import type { editProfileDialogMachine } from './EditProfileDialog.machine'

export const useProfileEditingView = (
  actor: Actor<typeof editProfileDialogMachine>,
  isVisible: boolean,
): void => {
  const { address, status } = useConnection()
  const observe = useCallback(
    (identity: string) => actor.getSnapshot().context.analytics.view(identity),
    [actor],
  )
  useAnalyticsView(
    posthog,
    status === 'disconnected' ? null : address,
    isVisible,
    observe,
  )
}
