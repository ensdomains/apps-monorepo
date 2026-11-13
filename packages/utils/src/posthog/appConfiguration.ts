import {
  applyAnalyticsConsent,
  canCaptureAnalytics,
  prepareAnalyticsEvent,
  protectStoredAnalyticsCredentials,
  SHARED_POSTHOG_CONFIG,
  writeAnalyticsConsent,
} from './analyticsConfiguration'
import {
  ANALYTICS_CONSENT_COOKIE,
  notifyAnalyticsConsent,
} from './analyticsConsent'
import { synchronizeAnalyticsIdentity } from './identitySync'

/** Shared SDK options; each application retains its bundled SDK instance. */
export const getAppPostHogConfig = (context: {
  readonly sourceApp: 'manager' | 'explorer'
  readonly environment: Parameters<typeof canCaptureAnalytics>[0]
  readonly getWalletAddress: () => string | null | undefined
}) => ({
  ...SHARED_POSTHOG_CONFIG,
  autocapture: {
    ...SHARED_POSTHOG_CONFIG.autocapture,
    dom_event_allowlist: ['click' as const],
  },
  consent_persistence_name: ANALYTICS_CONSENT_COOKIE,
  before_send: <
    Event extends {
      readonly event: string
      readonly properties: Readonly<Record<string, unknown>>
    },
  >(
    event: Event | null,
  ) =>
    prepareAnalyticsEvent(event, {
      ...context,
      walletAddress: context.getWalletAddress(),
    }),
  loaded: (
    client: Parameters<typeof synchronizeAnalyticsIdentity>[0] &
      Parameters<typeof protectStoredAnalyticsCredentials>[0],
  ) => {
    try {
      protectStoredAnalyticsCredentials(client)
      applyAnalyticsConsent(client)
      synchronizeAnalyticsIdentity(
        client,
        context.getWalletAddress(),
        canCaptureAnalytics(context.environment),
      )
      writeAnalyticsConsent(client, client.get_explicit_consent_status())
    } catch (error) {
      console.warn('[posthog] loaded synchronization failed', error)
    }
    notifyAnalyticsConsent()
  },
})
