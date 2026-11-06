import {
  getAnalyticsConsentRevision,
  hasAnalyticsConsent,
} from './analyticsConsent'
import type { AnalyticsEvents } from './eventContracts'
import { hasMatchingWalletIdentity } from './walletIdentity'

type Track = <Name extends keyof AnalyticsEvents>(
  name: Name,
  ...args: AnalyticsEvents[Name] extends undefined
    ? []
    : [AnalyticsEvents[Name]]
) => void

type TrackerOptions = {
  readonly getConnectedWalletAddress: () => string | null | undefined
  readonly client: Parameters<typeof hasAnalyticsConsent>[0] & {
    get_distinct_id: () => string
    capture: (
      name: string,
      properties?: Readonly<Record<string, unknown>>,
    ) => unknown
  }
}

/** Bind the existing SDK; configuration owns environment, metadata and automatic-data filtering. */
export const createAnalyticsTracker = ({
  client,
  getConnectedWalletAddress,
}: TrackerOptions) => {
  const send = (
    name: keyof AnalyticsEvents,
    properties?: AnalyticsEvents[keyof AnalyticsEvents],
  ): void => {
    try {
      if (
        hasAnalyticsConsent(client) &&
        hasMatchingWalletIdentity(
          getConnectedWalletAddress(),
          client.get_distinct_id(),
          name,
        )
      ) {
        if (properties && 'flow_id' in properties && !properties.flow_id) return
        void Promise.resolve(client.capture(name, properties)).catch(() => {})
      }
    } catch {
      // Analytics must never interrupt a product action.
    }
  }
  const track: Track = (name, ...args) => send(name, args[0])

  /** Use before an await to suppress outcomes after a wallet or consent change. */
  const startAnalyticsOperation = (): { readonly capture: Track } => {
    try {
      const connectedWallet = getConnectedWalletAddress()
      const wallet = connectedWallet?.toLowerCase()
      const identity = client.get_distinct_id()
      const revision = getAnalyticsConsentRevision()
      const isAllowed =
        revision !== undefined &&
        hasAnalyticsConsent(client) &&
        hasMatchingWalletIdentity(connectedWallet, identity)
      const capture: Track = (name, ...args) => {
        try {
          if (
            isAllowed &&
            revision === getAnalyticsConsentRevision() &&
            wallet === getConnectedWalletAddress()?.toLowerCase() &&
            identity === client.get_distinct_id()
          )
            send(name, args[0])
        } catch {
          // A stale or unavailable SDK cannot affect the pending operation.
        }
      }
      return { capture }
    } catch {
      return { capture: () => {} }
    }
  }
  return { track, startAnalyticsOperation }
}
