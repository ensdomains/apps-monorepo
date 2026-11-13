import { setAnalyticsConsent } from '@ens-apps/utils/posthog/analyticsConfiguration'
import { getAppPostHogConfig } from '@ens-apps/utils/posthog/appConfiguration'
import { useAnalyticsIdentitySync } from '@ens-apps/utils/posthog/useAnalyticsIdentitySync'
import { useHydrated } from '@tanstack/react-router'
import { act, waitFor } from '@testing-library/react'
import { connect, getConnection } from '@wagmi/core'
import { PostHog } from 'posthog-js/dist/module.full.no-external'
import { type ReactNode, useEffect } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import type { Address } from 'viem'
import { mainnet } from 'viem/chains'
import { afterEach, expect, it, vi } from 'vitest'
import { createConfig, createStorage, http, useConnection } from 'wagmi'
import { mock } from 'wagmi/connectors'
import { getConnectedWalletAddress } from '@/lib/posthog/events'
import { CustomWalletStack } from './CustomWalletStack'

const state = vi.hoisted(() => ({
  config: undefined as ReturnType<typeof createConfig> | undefined,
}))
vi.mock('@/lib/wagmi', () => ({
  get wagmiConfig() {
    return state.config
  },
}))
vi.mock('@/lib/mockWallet.mock', () => ({ isMockWalletEnabled: false }))
vi.mock('./custom/ConnectModalProvider', () => ({
  ConnectModalProvider: ({ children }: { readonly children: ReactNode }) =>
    children,
}))

const WALLET = '0x1111111111111111111111111111111111111111'
const OTHER_WALLET = '0x2222222222222222222222222222222222222222'
const link = { sync: () => {}, cancel: () => {} }

afterEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  vi.restoreAllMocks()
})

it.each([WALLET, OTHER_WALLET, undefined] as const)(
  'waits for actual SSR wallet restoration before reconciling %s',
  async (restoredWallet) => {
    const makeConfig = (wallet: Address = WALLET) =>
      createConfig({
        ssr: true,
        storage: createStorage({ storage: localStorage }),
        chains: [mainnet],
        connectors: [
          mock({
            accounts: [wallet],
            features: {
              defaultConnected: restoredWallet !== undefined,
              reconnect: true,
            },
          }),
        ],
        transports: { [mainnet.id]: http() },
      })
    if (restoredWallet) {
      const saved = makeConfig()
      const [connector] = saved.connectors
      if (!connector) throw new Error('Missing mock connector')
      await connect(saved, { connector })
    }
    const config = makeConfig(restoredWallet)
    state.config = config
    const client = new PostHog()
    vi.spyOn(client, '_send_request').mockImplementation(() => {})
    const sdkConfig = getAppPostHogConfig({
      sourceApp: 'manager',
      environment: {
        network: 'sepolia',
        isDevelopment: false,
        isDebugEnabled: false,
        projectKey: 'test',
      },
      getWalletAddress: getConnectedWalletAddress,
    })
    client.init('hydration-test', {
      ...sdkConfig,
      api_host: 'https://posthog.invalid',
      opt_out_useragent_filter: true,
    })
    setAnalyticsConsent(client, true)
    client.identify(WALLET)
    client.register({ utm_campaign: 'returning-visitor' })
    const session = client.get_session_id()
    const reset = vi.spyOn(client, 'reset')
    const Observer = () => {
      const connection = useConnection()
      const hydrated = useHydrated()
      useAnalyticsIdentitySync({ client, connection, isEnabled: true, link })
      useEffect(() => {
        if (hydrated) sdkConfig.loaded(client)
      }, [hydrated])
      return <div />
    }
    const App = () => (
      <CustomWalletStack>
        <Observer />
      </CustomWalletStack>
    )
    const element = document.createElement('div')
    element.innerHTML = renderToString(<App />)
    document.body.appendChild(element)
    const root = hydrateRoot(element, <App />)
    try {
      await waitFor(() => {
        expect(getConnection(config).status).toBe(
          restoredWallet ? 'connected' : 'disconnected',
        )
        expect(client.get_distinct_id()).toEqual(
          restoredWallet ?? expect.not.stringMatching(/^0x/),
        )
      })
      if (restoredWallet === WALLET) {
        expect(reset).not.toHaveBeenCalled()
        expect(client.get_session_id()).toBe(session)
        expect(client.get_property('utm_campaign')).toBe('returning-visitor')
      } else {
        expect(reset).toHaveBeenCalledOnce()
        expect(client.get_property('utm_campaign')).toBeUndefined()
      }
    } finally {
      await act(async () => root.unmount())
      element.remove()
      client.opt_out_capturing()
    }
  },
)
