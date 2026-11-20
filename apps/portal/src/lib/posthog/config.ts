import { canCaptureAnalytics } from '@ens-apps/utils/posthog/analyticsConfiguration'
import { getAppPostHogConfig } from '@ens-apps/utils/posthog/appConfiguration'
import type { PostHogConfig } from 'posthog-js/dist/module.full.no-external'
import { getConnectedWalletAddress } from './events'

export {
  applyAnalyticsConsent,
  resetKeepingConsent,
  setAnalyticsConsent,
} from '@ens-apps/utils/posthog/analyticsConfiguration'

const ANALYTICS_ENVIRONMENT = {
  network: import.meta.env.VITE_ENS_NETWORK,
  isDevelopment: import.meta.env.DEV,
  isDebugEnabled: import.meta.env.VITE_PUBLIC_POSTHOG_DEBUG === 'true',
  projectKey: import.meta.env.VITE_PUBLIC_POSTHOG_KEY,
}

export const IS_ANALYTICS_ENABLED = canCaptureAnalytics(ANALYTICS_ENVIRONMENT)
export const POSTHOG_KEY =
  import.meta.env.VITE_PUBLIC_POSTHOG_KEY?.trim() || undefined
export const POSTHOG_CONFIG = getAppPostHogConfig({
  sourceApp: 'explorer',
  environment: ANALYTICS_ENVIRONMENT,
  getWalletAddress: () => getConnectedWalletAddress(),
}) satisfies Partial<PostHogConfig>
