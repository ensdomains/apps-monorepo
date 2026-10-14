import { readConsent } from '@ens-apps/analytics-consent/consent'
import {
  ANONYMOUS_POSTHOG_CONFIG,
  applyDeclinedConsent,
  identifyWalletConnection,
  sweepPosthogStorage,
} from '@ens-apps/analytics-consent/posthog'
import { useAnalyticsConsent } from '@ens-apps/analytics-consent/react'
import {
  boot as bootIntercom,
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
import { useEffect, useRef } from 'react'
import { useConnection, useConnectionEffect } from 'wagmi'
import { INTERCOM_APP_ID } from '@/lib/intercom'
import { track } from './events'

export const PHProvider = ({
  children,
}: {
  children: React.ReactNode
}): React.ReactNode => {
  const [consent] = useAnalyticsConsent()
  const connection = useConnection()
  const connectionStatus = connection.status
  const connectionAddress = connection.address
  const connectionChainId = connection.chainId
  const connectorName = connection.connector?.name
  const initializedRef = useRef(false)
  // The init effect below applies the stored choice; transitions handle
  // changes after that.
  const transitionArmedRef = useRef(false)

  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true

    const stored = readConsent()
    // Flag evaluation and support must not crash the app if either SDK fails.
    try {
      // PostHog is optional: deployments without a key (local dev, e2e)
      // skip flag initialization for an undefined project.
      // Intercom still boots either way.
      const posthogKey = import.meta.env.VITE_PUBLIC_POSTHOG_KEY
      if (posthogKey) {
        // Stale PostHog storage is not consent: a stored opt-in or a
        // pre-pause wallet identity would otherwise leak into anonymous mode.
        if (stored !== 'accepted') sweepPosthogStorage()
        // The SDK always starts anonymous; an accepted choice opts in at
        // runtime below, so a later decline falls back to the anonymous
        // defaults once the sweep removes its marker.
        posthog.init(posthogKey, {
          api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
          ...ANONYMOUS_POSTHOG_CONFIG,
        })
        if (stored === 'accepted')
          posthog.opt_in_capturing()

          // The ESM `posthog-js` build keeps the singleton in an internal
          // registry and never attaches it to `window` (unlike the script-tag
          // snippet). Expose it for debugging in the console.
        ;(window as Window & { posthog?: typeof posthog }).posthog = posthog
      }
    } catch (error) {
      console.warn('[posthog] init failed', error)
    }

    try {
      bootIntercom({
        app_id: INTERCOM_APP_ID,
        // POSTHOG_LAUNCH_PAUSE: analytics correlation paused until consent/privacy support lands.
        // posthog_distinct_id: posthog.get_distinct_id(),
        // recent_replay: posthog.get_session_replay_url(),
      })

      // POSTHOG_LAUNCH_PAUSE: Intercom boot analytics paused. Restore getVisitorId and trackWithOptions imports when re-enabling.
      // const intercomVisitorId = getVisitorId()
      //
      // if (intercomVisitorId) {
      //   trackWithOptions('intercom:booted', undefined, {
      //     $set: {
      //       intercom_visitor_id: intercomVisitorId,
      //     },
      //   })
      // }
    } catch (error) {
      console.warn('[intercom] init failed', error)
    }
  }, [])

  // Consent transitions after init. Declared before the wallet effect so the
  // SDK is opted in before the wallet is identified.
  useEffect(() => {
    if (!initializedRef.current || !transitionArmedRef.current) {
      transitionArmedRef.current = true
      return
    }
    if (!import.meta.env.VITE_PUBLIC_POSTHOG_KEY) return
    if (consent === 'accepted') {
      posthog.opt_in_capturing()
    } else if (consent === 'declined') {
      applyDeclinedConsent(posthog)
    } else {
      // The choice vanished mid-session (removed outside this tab); null
      // counts as declined.
      applyDeclinedConsent(posthog)
    }
  }, [consent])

  // Wallet identity, only while accepted. Runs on consent changes and on
  // every wallet change, so connects, account switches and accepted reloads
  // with a connected wallet all pair the current address.
  useEffect(() => {
    if (
      !initializedRef.current ||
      !import.meta.env.VITE_PUBLIC_POSTHOG_KEY ||
      consent !== 'accepted'
    )
      return
    if (
      connectionStatus !== 'connected' ||
      !connectionAddress ||
      connectionChainId === undefined ||
      !connectorName
    )
      return
    try {
      identifyWalletConnection(posthog, {
        address: connectionAddress,
        chainId: connectionChainId,
        connectorName,
      })
    } catch (error) {
      console.warn('[posthog] wallet identify failed', error)
    }
  }, [
    connectionAddress,
    connectionChainId,
    connectionStatus,
    connectorName,
    consent,
  ])

  useConnectionEffect({
    onConnect(data) {
      try {
        track('wallet:connect', {
          wallet_address: data.address,
          chain_id: data.chainId,
          wallet_connector: data.connector.name,
        })
      } catch (error) {
        console.warn('[posthog] wallet:connect failed', error)
      }

      try {
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
        // Tracked before reset() so the event keeps the wallet identity; the
        // track helper drops it unless analytics were accepted.
        track('wallet:disconnect')
        posthog.reset()
      } catch (error) {
        console.warn('[posthog] wallet disconnect failed', error)
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
