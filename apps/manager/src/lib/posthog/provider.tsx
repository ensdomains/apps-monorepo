import { readConsent } from '@ens-apps/analytics-consent/consent'
import {
  clearConsentCookie,
  writeConsentCookie,
} from '@ens-apps/analytics-consent/cookie'
import {
  ANONYMOUS_POSTHOG_CONFIG,
  applyDeclinedConsent,
  identifyWalletConnection,
  sweepPosthogStorage,
} from '@ens-apps/analytics-consent/posthog'
import { useAnalyticsConsent } from '@ens-apps/analytics-consent/react'
import { transactionManager } from '@ens-apps/transaction-manager'
import {
  boot as bootIntercom,
  trackEvent as trackIntercomEvent,
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
import { useEffect, useRef } from 'react'
import { useConnection, useConnectionEffect } from 'wagmi'
import { track } from './events'

export const PHProvider = ({
  children,
}: {
  children: React.ReactNode
}): React.ReactNode => {
  const isHydrated = useHydrated()
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
    if (!isHydrated || initializedRef.current) return
    initializedRef.current = true

    const stored = readConsent()
    // Flag evaluation and support must not crash the app if either SDK fails.
    try {
      // Stale PostHog storage is not consent: a stored opt-in or a pre-pause
      // wallet identity would otherwise leak into the anonymous mode.
      if (stored !== 'accepted') sweepPosthogStorage()
      // The SDK always starts anonymous; an accepted choice opts in at
      // runtime below, so a later decline falls back to the anonymous
      // defaults once the sweep removes its marker.
      posthog.init(import.meta.env.VITE_PUBLIC_POSTHOG_KEY, {
        api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
        ...ANONYMOUS_POSTHOG_CONFIG,
      })
      if (stored === 'accepted')
        posthog.opt_in_capturing()

        // The ESM `posthog-js` build keeps the singleton in an internal
        // registry and never attaches it to `window` (unlike the script-tag
        // snippet). Expose it so e2e can reach `window.posthog.featureFlags`
        // to override flags, and for debugging in the console.
      ;(window as Window & { posthog?: typeof posthog }).posthog = posthog

      // The consent cookie mirrors the choice for the server-side route
      // guards; rewrite it in case it expired or was cleared, and clear a
      // stale mirror when no choice is stored.
      if (stored === null) clearConsentCookie()
      else writeConsentCookie(stored)
    } catch (error) {
      console.warn('[posthog] init failed', error)
    }

    try {
      bootIntercom({
        app_id: 're9q5yti',
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

        // POSTHOG_LAUNCH_PAUSE: failure analytics paused; local diagnostics stay active. Restore the ./events track import when re-enabling.
        // try {
        //   track('tm:failed_run', {
        //     tm_payload: payload,
        //     tm_run_id: payload.run.runId,
        //     tm_tx_id: payload.run.txId,
        //     tm_status: payload.run.status,
        //     tm_failure_stage: payload.summary.failureStage,
        //     tm_state_final: payload.summary.finalState,
        //     tm_chain_id: payload.summary.chainId,
        //     tm_intent_type: payload.summary.intentType,
        //     tm_request_type: payload.summary.requestType,
        //     tm_signer_type: payload.summary.signerType,
        //     tm_error_name: payload.summary.finalErrorName,
        //     tm_error_cause_name: payload.summary.finalError?.cause?.name,
        //     tm_hash: payload.summary.hash,
        //     tm_userop_hash: payload.summary.userOpHash,
        //     tm_retry_count: payload.summary.attemptCount,
        //     tm_event_count: payload.truncation.totalEvents,
        //     tm_truncated: payload.truncation.truncated,
        //     tm_dropped_events: payload.truncation.droppedEvents,
        //     source_app: 'manager',
        //     build_env: import.meta.env.MODE,
        //   })
        // } catch (error) {
        //   console.warn('Failed to capture tm:failed_run telemetry', error)
        // }
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

  // Consent transitions after init. Declared before the wallet effect so the
  // SDK is opted in before the wallet is identified.
  useEffect(() => {
    if (!initializedRef.current || !transitionArmedRef.current) {
      transitionArmedRef.current = true
      return
    }
    if (consent === 'accepted') {
      posthog.opt_in_capturing()
      writeConsentCookie('accepted')
    } else if (consent === 'declined') {
      applyDeclinedConsent(posthog)
      writeConsentCookie('declined')
    } else {
      // The choice vanished mid-session (removed outside this tab); null
      // counts as declined.
      applyDeclinedConsent(posthog)
      clearConsentCookie()
    }
  }, [consent])

  // Wallet identity, only while accepted. Runs on consent changes and on
  // every wallet change, so connects, account switches and accepted reloads
  // with a connected wallet all pair the current address.
  useEffect(() => {
    if (!initializedRef.current || consent !== 'accepted') return
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
