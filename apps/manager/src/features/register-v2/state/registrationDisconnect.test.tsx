/**
 * A wallet that disconnects mid-registration and comes back after a reload.
 *
 * Runs the pieces that decide it together: wagmi's own connection state, the
 * provider's suspend and resume, the persistence subscriber, and the app's
 * disconnect teardown. Each passes its unit tests alone, yet together they lost
 * the run: the teardown swept the resume record out of localStorage, so the
 * owner reconnected to plain pricing.
 */
// biome-ignore-all lint/suspicious/noExplicitAny: the start event carries a partial account

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, waitFor } from '@testing-library/react'
import { connect, disconnect, getWalletClient } from '@wagmi/core'
import { custom } from 'viem'
import { sepolia } from 'viem/chains'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createConfig, WagmiProvider } from 'wagmi'
import { mock } from 'wagmi/connectors'

const OWNER = '0x2222222222222222222222222222222222222222' as const

vi.mock('@/lib/smart-account/SmartAccountContext', async () => {
  const wagmi = await import('wagmi')
  return {
    // As the real context derives it in EOA mode: owner and signer both come
    // off the wagmi wallet client.
    useSmartAccountContext: () => {
      const { isConnecting, isReconnecting } = wagmi.useConnection()
      const { data: walletClient } = wagmi.useWalletClient()
      const owner = walletClient?.account?.address ?? null
      return {
        hasInitialized: !isConnecting && !isReconnecting,
        ownerAddress: owner,
        accountAddress: owner,
        signer: walletClient ? { type: 'eoa', walletClient } : null,
        walletClient: walletClient ?? null,
        enableSession: async () => null,
        getSessionEnablePayload: async () => undefined,
      }
    },
  }
})
vi.mock('@/lib/smart-account/sessionGate', () => ({
  needsSessionBeforeRegistration: () => false,
}))
vi.mock('@/utils/blockExplorer/verifyProxyContract', () => ({
  verifyProxyContract: vi.fn(),
}))
vi.mock('posthog-js/dist/module.full.no-external', () => ({
  default: { reset: vi.fn() },
}))
vi.mock('@/lib/posthog/events', () => ({ track: vi.fn() }))
vi.mock('@/utils/backend-client', () => ({
  backendAuthStore: {
    get: () => ({ context: {} }),
    trigger: { signOut: vi.fn() },
  },
}))

import { WalletLifecycle } from '@/lib/wallet/WalletLifecycle'
import {
  RegistrationV2UiProvider,
  useRegistrationV2Context,
} from './registrationUi.context'
import { useRegistrationStep } from './registrationUi.selectors'
import { DISCONNECT_GRACE_MS } from './useRegistrationResume'

// Every RPC request hangs, so the run stays live without reaching the chain.
const config = createConfig({
  chains: [sepolia],
  connectors: [mock({ accounts: [OWNER] })],
  transports: {
    [sepolia.id]: custom({ request: () => new Promise(() => {}) }),
  },
  storage: null,
})
const connectOwner = () =>
  act(async () => {
    await connect(config, { connector: config.connectors[0] })
  })

let uiActor: ReturnType<typeof useRegistrationV2Context>['uiActor'] | null =
  null

const Page = () => {
  const context = useRegistrationV2Context()
  uiActor = context.uiActor
  const step = useRegistrationStep(context.uiActor)
  return <output>{`${step}/${context.resume.status}`}</output>
}

const renderPage = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const view = render(
    <WagmiProvider config={config} reconnectOnMount={false}>
      <QueryClientProvider client={queryClient}>
        <WalletLifecycle />
        <RegistrationV2UiProvider label="leon">
          <Page />
        </RegistrationV2UiProvider>
      </QueryClientProvider>
    </WagmiProvider>,
  )
  return {
    screen: () => view.getByRole('status').textContent,
    unmount: view.unmount,
  }
}

const startRegistration = async () => {
  const walletClient = await getWalletClient(config)
  act(() => {
    uiActor?.send({ type: 'pricing.step.next' })
    uiActor?.send({
      type: 'registration.start',
      label: 'leon',
      duration: 31_536_000n,
      token: 'USDC',
      totalPrice: 5_000_000n,
      account: {
        signer: { type: 'eoa', walletClient },
        accountAddress: OWNER,
        ownerAddress: OWNER,
        walletClient,
      } as any,
      basePriceNumber: 5,
      premiumPriceNumber: 0,
    })
  })
}

describe('a wallet disconnecting mid-registration', () => {
  afterEach(async () => {
    await disconnect(config).catch(() => {})
    localStorage.clear()
  })

  it('stops the run, and resumes it when the owner reconnects after a reload', async () => {
    const page = renderPage()
    await connectOwner()
    await waitFor(() => expect(page.screen()).toBe('pricing/idle'))

    await startRegistration()
    await waitFor(() => expect(page.screen()).toMatch(/^registering\//))

    await act(async () => {
      await disconnect(config)
    })
    await waitFor(() => expect(page.screen()).toBe('pricing/no-wallet'), {
      timeout: DISCONNECT_GRACE_MS * 3,
    })

    // Reload while still disconnected.
    page.unmount()
    const reloaded = renderPage()
    await waitFor(() => expect(reloaded.screen()).toBe('pricing/no-wallet'))

    await connectOwner()
    await waitFor(() => expect(reloaded.screen()).toBe('registering/resumed'))
  }, 20_000)
})
