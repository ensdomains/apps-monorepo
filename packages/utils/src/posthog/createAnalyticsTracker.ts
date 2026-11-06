import { canCaptureAnalytics } from './analyticsConfiguration'
import {
  getAnalyticsConsentRevision,
  hasAnalyticsConsent,
} from './analyticsConsent'
import type { PostHogEvents } from './eventContracts'
import { sanitizeEventProperties } from './tracking'

type TrackerOptions<Options> = {
  readonly sourceApp: 'manager' | 'explorer'
  readonly getConnectedWalletAddress: () => string | null | undefined
  readonly environment: () => Parameters<typeof canCaptureAnalytics>[0]
  readonly client: Parameters<typeof hasAnalyticsConsent>[0] & {
    get_distinct_id: () => string
    capture: (
      name: string,
      properties: Readonly<Record<string, unknown>>,
      options?: Options,
    ) => unknown
  }
}

/** Undefined means the connector is unresolved; null means a stable disconnection. */
export const hasMatchingWalletIdentity = (
  address: string | null | undefined,
  identity: string,
  event?: string,
): boolean => {
  if (address === undefined) return false
  if (address === null)
    return event === 'wallet:disconnect' || !/^0x[\da-f]{40}$/i.test(identity)
  return address.toLowerCase() === identity
}

/** SDK transport is optional; never queue pre-consent actions or throw into product code. */
export const createAnalyticsTracker = <Options>(
  options: TrackerOptions<Options>,
) => {
  const send = <Name extends keyof PostHogEvents>(
    name: Name,
    properties: PostHogEvents[Name],
    captureOptions?: Options,
  ): void => {
    try {
      if (
        !hasAnalyticsConsent(options.client) ||
        !canCaptureAnalytics(options.environment()) ||
        !hasMatchingWalletIdentity(
          options.getConnectedWalletAddress(),
          options.client.get_distinct_id(),
          name,
        )
      )
        return
      const payload = {
        ...sanitizeEventProperties(name, properties),
        source_app: options.sourceApp,
      }
      if (captureOptions === undefined) options.client.capture(name, payload)
      else options.client.capture(name, payload, captureOptions)
    } catch {
      // Optional analytics must never interrupt a product action.
    }
  }
  const track = <Name extends keyof PostHogEvents>(
    name: Name,
    ...args: PostHogEvents[Name] extends undefined ? [] : [PostHogEvents[Name]]
  ): void => {
    send(name, args[0] as PostHogEvents[Name])
  }
  const startAnalyticsOperation = (): { readonly capture: typeof track } => {
    try {
      const walletAddress = options.getConnectedWalletAddress()?.toLowerCase()
      const identity = options.client.get_distinct_id()
      const isGranted =
        hasAnalyticsConsent(options.client) &&
        hasMatchingWalletIdentity(options.getConnectedWalletAddress(), identity)
      const revision = getAnalyticsConsentRevision()
      const capture: typeof track = (name, ...args) => {
        try {
          if (!isGranted || !hasAnalyticsConsent(options.client)) return
          if (
            revision !== getAnalyticsConsentRevision() ||
            identity !== options.client.get_distinct_id() ||
            walletAddress !== options.getConnectedWalletAddress()?.toLowerCase()
          )
            return
          track(name, ...args)
        } catch {
          // Stale or unavailable analytics contexts fail closed.
        }
      }
      return { capture }
    } catch {
      return { capture: () => {} }
    }
  }
  return { track, trackWithOptions: send, startAnalyticsOperation }
}
