import { transactionManager } from '@ens-apps/transaction-manager'
import {
  hasAnalyticsConsent,
  useAnalyticsConsent,
} from '@ens-apps/utils/posthog/analyticsConsent'
import {
  boot as bootIntercom,
  getVisitorId,
  trackEvent as trackIntercomEvent,
  update as updateIntercom,
} from '@intercom/messenger-js-sdk'
import { PostHogProvider } from '@posthog/react'
import { useHydrated } from '@tanstack/react-router'
// @posthog/react types its `client` prop with the `PostHog` type from the
// default `posthog-js` build, which is a *nominally* distinct declaration from
// the no-external build's `PostHog`. Import that type to cast at the provider
// boundary below.
import type { PostHog } from 'posthog-js'
// Fully-bundled, no-external build so PostHog never lazy-loads extension
// bundles via runtime <script> tags — our strict CSP blocks those. Same
// approach as portal; see PostHog's CSP guide:
// https://posthog.com/docs/advanced/content-security-policy
import posthog from 'posthog-js/dist/module.full.no-external'
import { type RefObject, useEffect, useRef } from 'react'
import { useConnectionEffect } from 'wagmi'
import { applyAnalyticsConsent, POSTHOG_CONFIG } from './config'
import { track, trackWithOptions } from './events'

type ConnectedWallet = {
  readonly address: string
  readonly chainId: number
  readonly connector: { readonly name: string }
}

// With consent the wallet becomes the analytics identity. Without it PostHog
// stays anonymous and gets the address only as an input to wallet-targeted
// flag rules (migration testers).
const identifyWallet = (wallet: ConnectedWallet) => {
  if (!hasAnalyticsConsent(posthog)) {
    posthog.setPersonPropertiesForFlags({ address: wallet.address })
    return
  }
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
// on Accept or Decline, and when another tab or app answers.
const useApplyAnalyticsConsent = (
  wallet: RefObject<ConnectedWallet | null>,
) => {
  const consent = useAnalyticsConsent(posthog)
  useEffect(() => {
    if (!consent) return
    applyAnalyticsConsent(posthog)
    if (wallet.current) identifyWallet(wallet.current)
    linkIntercomToAnalytics()
  }, [consent, wallet])
}

export const PHProvider = ({
  children,
}: {
  children: React.ReactNode
}): React.ReactNode => {
  const isHydrated = useHydrated()
  const wallet = useRef<ConnectedWallet | null>(null)

  useEffect(() => {
    if (!isHydrated) return

    // Flag evaluation and support must not crash the app if either SDK fails.
    try {
      posthog.init(import.meta.env.VITE_PUBLIC_POSTHOG_KEY, {
        api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
        ...POSTHOG_CONFIG,
      })

      // The ESM `posthog-js` build keeps the singleton in an internal
      // registry and never attaches it to `window` (unlike the script-tag
      // snippet). Expose it so e2e can reach `window.posthog.featureFlags`
      // to override flags, and for debugging in the console.
      ;(window as Window & { posthog?: typeof posthog }).posthog = posthog
    } catch (error) {
      console.warn('[posthog] init failed', error)
    }

    try {
      bootIntercom({ app_id: 're9q5yti' })
    } catch (error) {
      console.warn('[intercom] init failed', error)
    }

    const unsubscribeFailed = transactionManager.onFailedRunTelemetry(
      (payload) => {
        if (import.meta.env.DEV) {
          console.groupCollapsed(
            `[TM-RUN] failed ${payload.run.txId} status=${payload.run.status} stage=${payload.summary.failureStage}`,
          )
          console.info('summary', {
            runId: payload.run.runId,
            txId: payload.run.txId,
            status: payload.run.status,
            failureStage: payload.summary.failureStage,
            finalErrorName: payload.summary.finalErrorName,
            finalCauseName: payload.summary.finalError?.cause?.name,
            hash: payload.summary.hash,
            userOpHash: payload.summary.userOpHash,
            requestType: payload.summary.requestType,
          })
          console.groupEnd()
        }

        try {
          track('tm:failed_run', {
            tm_payload: payload,
            tm_run_id: payload.run.runId,
            tm_tx_id: payload.run.txId,
            tm_status: payload.run.status,
            tm_failure_stage: payload.summary.failureStage,
            tm_state_final: payload.summary.finalState,
            tm_chain_id: payload.summary.chainId,
            tm_intent_type: payload.summary.intentType,
            tm_request_type: payload.summary.requestType,
            tm_signer_type: payload.summary.signerType,
            tm_error_name: payload.summary.finalErrorName,
            tm_error_cause_name: payload.summary.finalError?.cause?.name,
            tm_hash: payload.summary.hash,
            tm_userop_hash: payload.summary.userOpHash,
            tm_retry_count: payload.summary.attemptCount,
            tm_event_count: payload.truncation.totalEvents,
            tm_truncated: payload.truncation.truncated,
            tm_dropped_events: payload.truncation.droppedEvents,
            source_app: 'manager',
            build_env: import.meta.env.MODE,
          })
        } catch (error) {
          console.warn('Failed to capture tm:failed_run telemetry', error)
        }
      },
    )

    const unsubscribeLive = import.meta.env.DEV
      ? transactionManager.onRunTelemetryEvent(({ txId, event }) => {
          try {
            const phase = event.substate
              ? `${event.phase}.${event.substate}`
              : event.phase
            console.debug(
              `[TM-RUN] ${txId} #${event.sequence} ${phase} reason=${event.reason} retry=${event.retryCount} hash=${event.hash || 'n/a'}`,
            )
          } catch (error) {
            console.warn('Failed to log tm run telemetry event', error)
          }
        })
      : () => {}

    return () => {
      unsubscribeFailed()
      unsubscribeLive()
    }
  }, [isHydrated])

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
        trackIntercomEvent('wallet:connect', {
          wallet_address: data.address,
          chain_id: data.chainId,
          wallet_connector: data.connector.name,
        })
      } catch (error) {
        console.warn('[intercom] wallet:connect failed', error)
      }
    },
    // WalletLifecycle resets PostHog itself.
    onDisconnect() {
      wallet.current = null
    },
  })

  if (!isHydrated) return <>{children}</>

  // Cast bridges the two posthog-js declaration files (see the type import
  // note above); the runtime object is the real PostHog SDK either way.
  return (
    <PostHogProvider client={posthog as unknown as PostHog}>
      {children}
    </PostHogProvider>
  )
}
