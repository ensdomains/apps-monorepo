import { transactionManager } from '@ens-apps/transaction-manager'
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
import { useHydrated } from '@tanstack/react-router'
// Fully-bundled, no-external build so PostHog never lazy-loads extension
// bundles via runtime <script> tags — our strict CSP blocks those. Same
// approach as portal; see PostHog's CSP guide:
// https://posthog.com/docs/advanced/content-security-policy
import posthog from 'posthog-js/dist/module.full.no-external'
import { useEffect } from 'react'
import { useConnection, useConnectionEffect } from 'wagmi'
import { IS_ANALYTICS_ENABLED, POSTHOG_CONFIG, POSTHOG_KEY } from './config'
import {
  getConnectedWalletAddress,
  startAnalyticsOperation,
  track,
} from './events'

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
  const isHydrated = useHydrated()
  const connection = useConnection()
  useAnalyticsIdentitySync({
    client: posthog,
    connection,
    isEnabled: IS_ANALYTICS_ENABLED,
    link: intercomLink,
  })

  useEffect(() => {
    if (!isHydrated) return

    // Flag evaluation and support must not crash the app if either SDK fails.
    try {
      if (POSTHOG_KEY)
        posthog.init(POSTHOG_KEY, {
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
  })

  return <>{children}</>
}
