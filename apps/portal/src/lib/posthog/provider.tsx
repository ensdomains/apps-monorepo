import {
  boot as bootIntercom,
  getVisitorId,
  shutdown as shutdownIntercom,
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
import { useConfig, useConnectionEffect } from 'wagmi'
import { getAccount } from 'wagmi/actions'
import { useTelemetryEnabled } from '@/hooks/useTelemetryEnabled'
import { INTERCOM_APP_ID, initializeIntercom } from '@/lib/intercom'
import { isPostHogActive, track, trackWithOptions } from './events'

const identifyWallet = (wallet: {
  address: string
  chainId: number
  connectorName: string
}) => {
  posthog.identify(
    wallet.address,
    { address: wallet.address },
    { initial_address: wallet.address },
  )

  posthog.register({
    wallet_address: wallet.address,
    chain_id: wallet.chainId,
    wallet_connector: wallet.connectorName,
  })
}

const startTelemetry = (wallet?: Parameters<typeof identifyWallet>[0]) => {
  // Analytics is optional: deployments without a key (local dev, e2e)
  // skip init rather than sending events to an undefined project.
  const posthogKey = import.meta.env.VITE_PUBLIC_POSTHOG_KEY
  if (posthogKey) {
    if (posthog.__loaded) {
      posthog.set_config({ advanced_disable_flags: false })
    } else {
      posthog.init(posthogKey, {
        api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
        capture_pageview: 'history_change',
        disable_session_recording: !!import.meta.env.DEV,
        defaults: '2025-11-30',
        person_profiles: 'identified_only',
        // Opting out also deletes PostHog's cookie/localStorage state.
        opt_out_persistence_by_default: true,
      })
    }

    // An opt-out persisted by PostHog (a previous session or toggle) wins
    // over a fresh init, so lift it now that the user has opted in.
    if (posthog.has_opted_out_capturing()) {
      posthog.opt_in_capturing({ captureEventName: false })
    }

    if (wallet) identifyWallet(wallet)
  }

  initializeIntercom()
  bootIntercom({
    app_id: INTERCOM_APP_ID,
    ...(posthog.__loaded && {
      posthog_distinct_id: posthog.get_distinct_id(),
      recent_replay: posthog.get_session_replay_url(),
    }),
  })

  const intercomVisitorId = getVisitorId()

  if (intercomVisitorId) {
    trackWithOptions('intercom:booted', undefined, {
      $set: {
        intercom_visitor_id: intercomVisitorId,
      },
    })
  }
}

const stopTelemetry = () => {
  if (posthog.__loaded) {
    posthog.reset()
    posthog.opt_out_capturing()
    posthog.stopSessionRecording()
    // The SDK's 5-minute flag refresh doesn't check opt-out; stop it directly.
    posthog.set_config({ advanced_disable_flags: true })
  }

  // Ends the chat session. The widget script itself can't be unloaded, but it
  // does nothing further until boot() is called again.
  shutdownIntercom()
}

export const PHProvider = ({
  children,
}: {
  children: React.ReactNode
}): React.ReactNode => {
  const [telemetryEnabled] = useTelemetryEnabled()
  const wagmiConfig = useConfig()

  useEffect(() => {
    // Non-critical analytics init; Intercom can throw on blocked domains (403)
    // and this runs in an effect, so an unguarded throw would crash the app.
    try {
      if (!telemetryEnabled) {
        stopTelemetry()
        return
      }

      const { address, chainId, connector } = getAccount(wagmiConfig)
      startTelemetry(
        address && chainId && connector
          ? { address, chainId, connectorName: connector.name }
          : undefined,
      )
    } catch (error) {
      console.warn('[analytics] init failed', error)
    }
  }, [telemetryEnabled, wagmiConfig])

  useConnectionEffect({
    onConnect(data) {
      if (!telemetryEnabled) return

      // Analytics on connect is non-critical; never let it crash the app.
      try {
        if (isPostHogActive()) {
          identifyWallet({
            address: data.address,
            chainId: data.chainId,
            connectorName: data.connector.name,
          })
        }

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
      if (!telemetryEnabled) return

      try {
        track('wallet:disconnect')
        if (isPostHogActive()) posthog.reset()
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
