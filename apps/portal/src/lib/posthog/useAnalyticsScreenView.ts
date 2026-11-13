import { useAnalyticsView } from '@ens-apps/utils/posthog/useAnalyticsView'
import posthog from 'posthog-js/dist/module.full.no-external'
import { useConnection } from 'wagmi'

export const useAnalyticsScreenView = (
  isVisible: boolean,
  observe: (identity: string) => void,
): void => {
  const { address, status } = useConnection()
  useAnalyticsView(
    posthog,
    status === 'disconnected' ? null : address,
    isVisible,
    observe,
  )
}
