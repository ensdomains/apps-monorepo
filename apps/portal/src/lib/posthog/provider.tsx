import {
  hasAnalyticsConsent,
  useAnalyticsConsent,
} from '@ens-apps/utils/posthog/analyticsConsent'
import {
  getVisitorId,
  trackEvent as trackIntercomEvent,
  update as updateIntercom,
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
import { type RefObject, useEffect, useRef } from 'react'
import { useConnectionEffect } from 'wagmi'
import { startIntercom, stopIntercom } from '@/lib/intercom'
import {
  applyAnalyticsConsent,
  POSTHOG_CONFIG,
  resetKeepingConsent,
} from './config'
import { track, trackWithOptions } from './events'

type ConnectedWallet = {
  readonly address: string
  readonly chainId: number
  readonly connector: { readonly name: string }
}

// With consent the wallet becomes the analytics identity. Without it nothing
// is sent: the Explorer's flags don't use the address.
const identifyWallet = (wallet: ConnectedWallet) => {
  if (!hasAnalyticsConsent(posthog)) return
  posthog.identify(
    wallet.address,
    { address: wallet.address },
    { initial_address: wallet.address },
  )
  posthog.register({
    wallet_address: wallet.address,
    chain_id: wallet.chainId,
    wallet_connector: wallet.connector.name,
  })
}

// Links support chats to analytics, only for visitors who accepted.
const linkIntercomToAnalytics = () => {
  if (!hasAnalyticsConsent(posthog)) return
  updateIntercom({
    posthog_distinct_id: posthog.get_distinct_id(),
    recent_replay: posthog.get_session_replay_url(),
  })
  const intercomVisitorId = getVisitorId()
  if (intercomVisitorId)
    trackWithOptions('intercom:booted', undefined, {
      $set: { intercom_visitor_id: intercomVisitorId },
    })
}

// Applies PostHog's answer once it's known and whenever it changes: on load,
// on Accept or Decline, and when another tab or app answers. Intercom only
// runs with consent.
const useApplyAnalyticsConsent = (
  wallet: RefObject<ConnectedWallet | null>,
) => {
  const consent = useAnalyticsConsent(posthog)
  useEffect(() => {
    if (!consent) return
    applyAnalyticsConsent(posthog)
    if (wallet.current) identifyWallet(wallet.current)
    if (consent === 'granted') {
      startIntercom()
      linkIntercomToAnalytics()
    } else stopIntercom()
  }, [consent, wallet])
}

export const PHProvider = ({
  children,
}: {
  children: React.ReactNode
}): React.ReactNode => {
  const wallet = useRef<ConnectedWallet | null>(null)

  useEffect(() => {
    // Flag evaluation must not crash the app if PostHog fails.
    try {
      // PostHog is optional: deployments without a key (local dev, e2e)
      // skip flag initialization for an undefined project.
      const posthogKey = import.meta.env.VITE_PUBLIC_POSTHOG_KEY
      if (posthogKey) {
        posthog.init(posthogKey, {
          api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
          ...POSTHOG_CONFIG,
        })
      }
    } catch (error) {
      console.warn('[posthog] init failed', error)
    }
  }, [])

  useApplyAnalyticsConsent(wallet)

  useConnectionEffect({
    onConnect(data) {
      wallet.current = data
      try {
        identifyWallet(data)
        track('wallet:connect', {
          wallet_address: data.address,
          chain_id: data.chainId,
          wallet_connector: data.connector.name,
        })
      } catch (error) {
        console.warn('[posthog] wallet identify failed', error)
      }

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
      wallet.current = null
      try {
        track('wallet:disconnect')
        resetKeepingConsent(posthog)
      } catch (error) {
        console.warn('[posthog] wallet reset failed', error)
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
