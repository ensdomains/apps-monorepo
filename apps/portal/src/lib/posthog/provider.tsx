import { hasAnalyticsConsent } from '@ens-apps/utils/posthog/analyticsConsent'
import { createAnalyticsSupportLink } from '@ens-apps/utils/posthog/analyticsSupport'
import { synchronizeAnalyticsIdentity } from '@ens-apps/utils/posthog/identitySync'
import { useAnalyticsIdentitySync } from '@ens-apps/utils/posthog/useAnalyticsIdentitySync'
import {
  boot as bootIntercom,
  getVisitorId,
  trackEvent as trackIntercomEvent,
  update as updateIntercom,
} from '@intercom/messenger-js-sdk'
// Import the fully-bundled, no-external build so PostHog never lazy-loads its
// extension bundles (session recorder, surveys, dead-clicks, web-vitals,
// exception autocapture) at runtime. The default `posthog-js` build injects
// those via runtime <script> tags + an inline loader, both of which our strict
// CSP blocks (no 'unsafe-inline'; script-src is host/hash-pinned) — and our
// PostHog reverse proxy (edge.ens.domains) doesn't serve the /static/*.js
// asset paths anyway. Pre-bundling sidesteps both problems. This disables the
// Toolbar (a dev-only feature we don't use in prod). See PostHog's CSP guide:
// https://posthog.com/docs/advanced/content-security-policy
import posthog from 'posthog-js/dist/module.full.no-external'
import { useEffect } from 'react'
import { useConnection, useConnectionEffect } from 'wagmi'
import {
  IS_ANALYTICS_ENABLED,
  POSTHOG_CONFIG,
  POSTHOG_KEY,
  resetKeepingConsent,
} from './config'
import { getConnectedWalletAddress, track } from './events'

const intercomLink = createAnalyticsSupportLink({
  client: posthog,
  isEnabled: IS_ANALYTICS_ENABLED,
  getWalletAddress: getConnectedWalletAddress,
  getVisitorId,
  update: updateIntercom,
  track,
})

export const PHProvider = ({
  children,
}: {
  children: React.ReactNode
}): React.ReactNode => {
  const connection = useConnection()
  useAnalyticsIdentitySync({
    client: posthog,
    connection,
    isEnabled: IS_ANALYTICS_ENABLED,
    link: intercomLink,
  })

  useEffect(() => {
    // Flag evaluation and support must not crash the app if either SDK fails.
    try {
      // PostHog is optional: deployments without a key (local dev, e2e)
      // skip flag initialization for an undefined project.
      // Intercom still boots either way.
      if (POSTHOG_KEY) {
        posthog.init(POSTHOG_KEY, {
          api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
          ...POSTHOG_CONFIG,
        })
      }
    } catch (error) {
      console.warn('[posthog] init failed', error)
    }

    try {
      const intercomAppId = import.meta.env.VITE_INTERCOM_APP_ID
      if (intercomAppId) bootIntercom({ app_id: intercomAppId })
    } catch (error) {
      console.warn('[intercom] init failed', error)
    }
  }, [])

  useConnectionEffect({
    onConnect(data) {
      try {
        synchronizeAnalyticsIdentity(
          posthog,
          data.address,
          IS_ANALYTICS_ENABLED,
        )
        intercomLink.sync()
        track('wallet:connect', {
          chain_id: data.chainId,
          wallet_connector: data.connector.name,
        })
      } catch (error) {
        console.warn('[posthog] wallet identify failed', error)
      }

      // Intercom runs for everyone, for support; the wallet only with consent.
      try {
        if (hasAnalyticsConsent(posthog))
          trackIntercomEvent('wallet:connect', {
            wallet_address: data.address,
            chain_id: data.chainId,
            wallet_connector: data.connector.name,
          })
      } catch (error) {
        console.warn('[intercom] wallet:connect failed', error)
      }
    },
    onDisconnect() {
      try {
        track('wallet:disconnect')
        resetKeepingConsent(posthog)
      } catch (error) {
        console.warn('[posthog] wallet reset failed', error)
      }
    },
  })

  return <>{children}</>
}
