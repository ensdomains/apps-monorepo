import { useEffect } from 'react'
import { applyAnalyticsConsent } from './analyticsConfiguration'
import { useAnalyticsConsent } from './analyticsConsent'
import {
  type AnalyticsIdentityClient,
  synchronizeAnalyticsIdentity,
} from './identitySync'

/** Framework synchronization only; SDK startup and application telemetry stay local. */
export const useAnalyticsIdentitySync = ({
  client,
  connection,
  isEnabled,
  link,
}: {
  readonly client: AnalyticsIdentityClient
  readonly connection: {
    readonly status: string
    readonly address?: string
    readonly chainId?: number
    readonly connector?: { readonly name: string }
  }
  readonly isEnabled: boolean
  readonly link: { readonly sync: () => void; readonly cancel: () => void }
}): void => {
  const consent = useAnalyticsConsent(client)
  const { status, address, chainId, connector } = connection
  useEffect(() => () => link.cancel(), [link])
  useEffect(() => {
    if (
      !client.__loaded ||
      (status !== 'connected' && status !== 'disconnected')
    )
      return
    try {
      applyAnalyticsConsent(client)
      synchronizeAnalyticsIdentity(
        client,
        status === 'connected' ? address : null,
        isEnabled,
      )
      if (
        status === 'connected' &&
        chainId &&
        connector &&
        consent === 'granted' &&
        isEnabled
      )
        client.register({ chain_id: chainId, wallet_connector: connector.name })
      link.sync()
    } catch (error) {
      console.warn('[posthog] identity synchronization failed', error)
    }
  }, [client, status, address, chainId, connector, consent, isEnabled, link])
}
