import {
  boot as bootIntercom,
  getVisitorId,
  trackEvent as trackIntercomEvent,
} from '@intercom/messenger-js-sdk'
import { PostHogProvider } from '@posthog/react'
// @posthog/react types its `client` prop with the `PostHog` type from the
// default `posthog-js` build, which is a *nominally* distinct declaration from
// the no-external build's `PostHog` (private fields make them structurally
// incompatible even though they're the same runtime SDK). Import that type to
// cast our instance at the provider boundary below.
import type { PostHog } from 'posthog-js'
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
import { useConnectionEffect } from 'wagmi'
import { INTERCOM_APP_ID } from '@/lib/intercom'
import { track, trackWithOptions } from './events'

export const PHProvider = ({
  children,
}: {
  children: React.ReactNode
}): React.ReactNode => {
  useEffect(() => {
    // Non-critical analytics init; Intercom can throw on blocked domains (403)
    // and this runs in an effect, so an unguarded throw would crash the app.
    try {
      // Analytics is optional: deployments without a key (local dev, e2e)
      // skip init rather than sending events to an undefined project.
      // Intercom still boots either way.
      const posthogKey = import.meta.env.VITE_PUBLIC_POSTHOG_KEY
      if (posthogKey) {
        posthog.init(posthogKey, {
          api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
          capture_pageview: 'history_change',
          disable_session_recording: !!import.meta.env.DEV,
          defaults: '2025-11-30',
          person_profiles: 'identified_only',
        })
      }

      bootIntercom({
        app_id: INTERCOM_APP_ID,
        posthog_distinct_id: posthog.get_distinct_id(),
        recent_replay: posthog.get_session_replay_url(),
      })

      const intercomVisitorId = getVisitorId()

      if (intercomVisitorId) {
        trackWithOptions('intercom:booted', undefined, {
          $set: {
            intercom_visitor_id: intercomVisitorId,
          },
        })
      }
    } catch (error) {
      console.warn('[analytics] init failed', error)
    }
  }, [])

  useConnectionEffect({
    onConnect(data) {
      // Analytics on connect is non-critical; never let it crash the app.
      try {
        posthog.identify(
          data.address,
          {
            address: data.address,
          },
          {
            initial_address: data.address,
          },
        )

        posthog.register({
          wallet_address: data.address,
          chain_id: data.chainId,
          wallet_connector: data.connector.name,
        })

        track('wallet:connect', {
          wallet_address: data.address,
          chain_id: data.chainId,
          wallet_connector: data.connector.name,
        })

        trackIntercomEvent('wallet:connect', {
          wallet_address: data.address,
          chain_id: data.chainId,
          wallet_connector: data.connector.name,
        })
      } catch (error) {
        console.warn('[analytics] wallet:connect tracking failed', error)
      }
    },
    onDisconnect() {
      try {
        track('wallet:disconnect')
        posthog.reset()
      } catch (error) {
        console.warn('[analytics] wallet:disconnect tracking failed', error)
      }
    },
  })

  // Cast bridges the two posthog-js declaration files (see the type import
  // note above); the runtime object is the real PostHog SDK either way.
  return (
    <PostHogProvider client={posthog as unknown as PostHog}>
      {children}
    </PostHogProvider>
  )
}
