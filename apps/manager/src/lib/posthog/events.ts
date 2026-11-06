import { createAnalyticsTracker } from '@ens-apps/utils/posthog/createAnalyticsTracker'
import { getConnection } from '@wagmi/core/actions'
import posthog from 'posthog-js/dist/module.full.no-external'
import { wagmiConfig } from '@/lib/wagmi'

export type { AnalyticsEvents } from '@ens-apps/utils/posthog/eventContracts'

export const getConnectedWalletAddress = (): string | null | undefined => {
  try {
    const connection = getConnection(wagmiConfig)
    if (connection.status === 'disconnected') return null
    if (connection.status !== 'connected') return undefined
    return connection.address
  } catch {
    return undefined
  }
}

export const { track, startAnalyticsOperation } = createAnalyticsTracker({
  client: posthog,
  getConnectedWalletAddress,
})
