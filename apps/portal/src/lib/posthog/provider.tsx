import { PostHogProvider } from '@posthog/react'
import posthog from 'posthog-js'
import { useEffect } from 'react'
import { useConnectionEffect } from 'wagmi'
import { track } from './events'

export const PHProvider = ({
  children,
}: {
  children: React.ReactNode
}): React.ReactNode => {
  useEffect(() => {
    posthog.init(import.meta.env.VITE_PUBLIC_POSTHOG_KEY, {
      api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
      capture_pageview: 'history_change',
      disable_session_recording: !!import.meta.env.DEV,
      defaults: '2025-11-30',
      person_profiles: 'identified_only',
    })
  }, [])

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
    },
    onDisconnect() {
      track('wallet:disconnect')
      posthog.reset()
    },
  })

  return <PostHogProvider client={posthog}>{children}</PostHogProvider>
}
