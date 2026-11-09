import { transactionManager } from '@ens-apps/transaction-manager'
import {
  hasAnalyticsConsent,
  useAnalyticsConsent,
} from '@ens-apps/utils/posthog/analyticsConsent'
import { getWalletIdentityAction } from '@ens-apps/utils/posthog/walletIdentity'
import {
  boot as bootIntercom,
  getVisitorId,
  trackEvent as trackIntercomEvent,
  update as updateIntercom,
} from '@intercom/messenger-js-sdk'
import { useHydrated } from '@tanstack/react-router'
// Fully-bundled, no-external build so PostHog never lazy-loads extension
// bundles via runtime <script> tags — our strict CSP blocks those. Same
// approach as portal; see PostHog's CSP guide:
// https://posthog.com/docs/advanced/content-security-policy
import posthog from 'posthog-js/dist/module.full.no-external'
import { type RefObject, useEffect, useRef } from 'react'
import { useConnection, useConnectionEffect } from 'wagmi'
import {
  applyAnalyticsConsent,
  getPostHogKey,
  isAnalyticsEnabled,
  POSTHOG_CONFIG,
  resetKeepingConsent,
} from './config'
import { startAnalyticsOperation, track } from './events'

type ConnectedWallet = {
  readonly address: string
  readonly chainId: number
  readonly connector: { readonly name: string }
}

// With consent the wallet becomes the analytics identity. Without it nothing
// is sent, so wallet-targeted flags match only after Accept.
const identifyWallet = (wallet: ConnectedWallet | null) => {
  if (!posthog.__loaded) return
  const action = getWalletIdentityAction({
    isGranted: hasAnalyticsConsent(posthog) && isAnalyticsEnabled(),
    isIdentified: posthog.get_property('$user_state') === 'identified',
    distinctId: posthog.get_distinct_id(),
    address: wallet?.address,
  })
  if (action.type === 'reset' || action.type === 'replace')
    resetKeepingConsent(posthog)
  if (action.type === 'identify' || action.type === 'replace')
    posthog.identify(action.address)
  if (wallet && hasAnalyticsConsent(posthog))
    posthog.register({
      chain_id: wallet.chainId,
      wallet_connector: wallet.connector.name,
    })
}

// Links support chats to analytics, only for visitors who accepted.
const linkIntercomToAnalytics = () => {
  if (!hasAnalyticsConsent(posthog) || !isAnalyticsEnabled()) return
  updateIntercom({
    posthog_distinct_id: posthog.get_distinct_id(),
  })
  const intercomVisitorId = getVisitorId()
  if (intercomVisitorId) {
    track('intercom:booted')
  }
}

// Applies PostHog's answer once it's known and whenever it changes: on load,
// on Accept or Decline, and when another tab or app answers.
const useApplyAnalyticsConsent = (
  wallet: RefObject<ConnectedWallet | null>,
) => {
  const consent = useAnalyticsConsent(posthog)
  useEffect(() => {
    if (!consent) return
    try {
      applyAnalyticsConsent(posthog)
      identifyWallet(wallet.current)
      linkIntercomToAnalytics()
    } catch (error) {
      console.warn('[posthog] consent synchronization failed', error)
    }
  }, [consent, wallet])
}

export const PHProvider = ({
  children,
}: {
  children: React.ReactNode
}): React.ReactNode => {
  const isHydrated = useHydrated()
  const wallet = useRef<ConnectedWallet | null>(null)
  const connection = useConnection()

  useEffect(() => {
    if (
      connection.status !== 'connected' &&
      connection.status !== 'disconnected'
    )
      return
    const connected =
      connection.address && connection.chainId && connection.connector
        ? {
            address: connection.address,
            chainId: connection.chainId,
            connector: connection.connector,
          }
        : null
    wallet.current = connected
    try {
      identifyWallet(connected)
    } catch (error) {
      console.warn('[posthog] wallet synchronization failed', error)
    }
  }, [
    connection.address,
    connection.chainId,
    connection.connector,
    connection.status,
  ])

  useEffect(() => {
    if (!isHydrated) return

    // Flag evaluation and support must not crash the app if either SDK fails.
    try {
      const posthogKey = getPostHogKey()
      if (posthogKey)
        posthog.init(posthogKey, {
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

    const runCaptures = new Map<
      string,
      ReturnType<typeof startAnalyticsOperation>
    >()
    const unsubscribeRunIdentity = transactionManager.onRunTelemetryEvent(
      ({ runId, event, status }) => {
        if (event.sequence === 1) {
          if (runCaptures.size >= 256) runCaptures.clear()
          runCaptures.set(runId, startAnalyticsOperation())
        }
        if (status === 'success') runCaptures.delete(runId)
      },
    )
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
          runCaptures
            .get(payload.run.runId)
            ?.capture('transaction:execution_end', {
              operation_id: payload.run.runId,
              outcome:
                payload.run.status === 'cancelled' ? 'cancelled' : 'failure',
              failure_stage: payload.summary.failureStage,
              chain_id: payload.summary.chainId,
              execution_method: payload.summary.requestType,
              attempt_count: payload.summary.attemptCount,
            })
          runCaptures.delete(payload.run.runId)
        } catch (error) {
          console.warn('Failed to capture transaction telemetry', error)
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
      unsubscribeRunIdentity()
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
    // WalletLifecycle resets PostHog itself.
    onDisconnect() {
      wallet.current = null
    },
  })

  return <>{children}</>
}
