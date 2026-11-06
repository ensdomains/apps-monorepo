import { createAnalyticsTracker } from '@ens-apps/utils/posthog/createAnalyticsTracker'
import { getConnection } from '@wagmi/core/actions'
import posthog, {
  type CaptureOptions,
} from 'posthog-js/dist/module.full.no-external'
import { wagmiConfig } from '@/lib/wagmi'

export type { PostHogEvents } from '@ens-apps/utils/posthog/eventContracts'

export const getConnectedWalletAddress = (): string | null | undefined => {
  try {
    const connection = getConnection(wagmiConfig)
    if (connection.status === 'disconnected') return null
    if (connection.status !== 'connected') return undefined
    return connection.address
  } catch {
    return undefined
  }
}

export const { track, trackWithOptions, startAnalyticsOperation } =
  createAnalyticsTracker<CaptureOptions>({
    sourceApp: 'explorer',
    client: posthog,
    getConnectedWalletAddress,
    environment: () => ({
      environment: import.meta.env.VITE_PUBLIC_ANALYTICS_ENV,
      isDevelopment: import.meta.env.DEV,
      isDebugEnabled: import.meta.env.VITE_PUBLIC_ANALYTICS_DEBUG === 'true',
      productionKey: import.meta.env.VITE_PUBLIC_POSTHOG_KEY,
      stagingKey: import.meta.env.VITE_PUBLIC_POSTHOG_STAGING_KEY,
    }),
  })
