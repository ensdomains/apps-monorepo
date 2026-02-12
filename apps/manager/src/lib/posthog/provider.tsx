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

    const unsubscribe = transactionManager.onFailedRunTelemetry((payload) => {
      try {
        track('tm:failed_run', {
          ...payload,
          source_app: 'manager',
          build_env: import.meta.env.MODE,
        })
      } catch (error) {
        console.warn('Failed to capture tm:failed_run telemetry', error)
      }
    })

    return unsubscribe
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
