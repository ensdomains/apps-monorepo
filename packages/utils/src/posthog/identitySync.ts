import { resetKeepingConsent } from './analyticsConfiguration'
import { hasAnalyticsConsent } from './analyticsConsent'
import { getWalletIdentityAction } from './walletIdentity'

export type AnalyticsIdentityClient = Parameters<
  typeof resetKeepingConsent
>[0] & {
  readonly get_distinct_id: () => string
  readonly identify: (address: string) => void
  readonly register: (properties: Readonly<Record<string, unknown>>) => void
  readonly config?: { readonly capture_pageview?: unknown }
  readonly set_config: (config: {
    readonly capture_pageview?: false | 'history_change'
  }) => void
}

/** Reconcile identity before allowing the SDK to capture its initial pageview. */
export const synchronizeAnalyticsIdentity = (
  client: AnalyticsIdentityClient,
  address: string | null | undefined,
  isEnabled: boolean,
): void => {
  if (!client.__loaded) return
  if (address === undefined) {
    if (client.get_property('$user_state') === 'identified')
      client.set_config({ capture_pageview: false })
    return
  }
  const action = getWalletIdentityAction({
    isGranted: hasAnalyticsConsent(client) && isEnabled,
    isIdentified: client.get_property('$user_state') === 'identified',
    distinctId: client.get_distinct_id(),
    address: address ?? undefined,
  })
  if (action.type === 'reset' || action.type === 'replace')
    resetKeepingConsent(client)
  if (action.type === 'identify' || action.type === 'replace')
    client.identify(action.address)
  if (client.config?.capture_pageview === false) {
    client.set_config({ capture_pageview: 'history_change' })
    // The SDK deduplicates its native initial pageview, including repeat opt-ins.
    if (hasAnalyticsConsent(client) && isEnabled)
      client.opt_in_capturing({ captureEventName: false })
  }
}
