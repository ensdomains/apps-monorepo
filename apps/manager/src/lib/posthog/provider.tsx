import { transactionManager } from '@ens-apps/transaction-manager'
import {
  boot as bootIntercom,
  getVisitorId,
  trackEvent as trackIntercomEvent,
} from '@intercom/messenger-js-sdk'
import { PostHogProvider } from '@posthog/react'
import { useHydrated } from '@tanstack/react-router'
import posthog from 'posthog-js'
import { useEffect } from 'react'
import { useConnectionEffect } from 'wagmi'
import { track, trackWithOptions } from './events'

export const PHProvider = ({
  children,
}: {
  children: React.ReactNode
}): React.ReactNode => {
  const isHydrated = useHydrated()

  useEffect(() => {
    if (!isHydrated) return

    posthog.init(import.meta.env.VITE_PUBLIC_POSTHOG_KEY, {
      api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
      capture_pageview: 'history_change',
      disable_session_recording: !!import.meta.env.DEV,
      defaults: '2025-11-30',
      person_profiles: 'identified_only',
    })

    bootIntercom({
      app_id: 're9q5yti',
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

  useConnectionEffect({
    onConnect(data) {
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
    },
  })

  if (!isHydrated) return <>{children}</>

  return <PostHogProvider client={posthog}>{children}</PostHogProvider>
}
