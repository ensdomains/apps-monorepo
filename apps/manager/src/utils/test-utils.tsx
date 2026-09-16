import { extendChainWithEns } from '@ensdomains/ensjs/chain'
import {
  render as baseRender,
  type RenderOptions,
} from '@testing-library/react'
import { createConfig, mock, WagmiProvider } from 'wagmi'
import '@testing-library/jest-dom'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { mainnet } from 'viem/chains'
import { afterEach, beforeEach, vi } from 'vitest'

import { hashFn } from 'wagmi/query'

const mainnetWithEns = extendChainWithEns(mainnet)

const client = createClient({
  transport: http('http://mock.local'),
  chain: mainnetWithEns,
})

const privateKeyAccount = privateKeyToAccount(
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
)

const wagmiConfig = {
  ...createConfig({
    connectors: [
      mock({
        accounts: [privateKeyAccount.address],
        features: {},
      }),
    ],
    chains: [mainnetWithEns],
    client: () => client,
  }),
  _isEns: true,
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: Infinity,
      retry: false,
      queryKeyHashFn: hashFn,
    },
  },
})

i18n.loadAndActivate({ locale: 'en', messages: {} })

beforeEach(() => queryClient.clear())

interface AllTheProvidersProps {
  children: React.ReactNode
}

const AllTheProviders = ({ children }: AllTheProvidersProps) => (
  // Just wagmi (mock connector). The wallet hooks also call usePrivy(); with no
  // PrivyProvider it returns its default un-ready state, which is fine for the
  // render smoke tests here (no live connect/login is exercised).
  <I18nProvider i18n={i18n}>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  </I18nProvider>
)

export const render = (ui: React.ReactNode, options?: RenderOptions) =>
  baseRender(ui, { wrapper: AllTheProviders, ...options })

class ImagePreloadStub extends EventTarget {
  complete = false
  naturalWidth = 0
  src = ''
}

/**
 * Replaces `window.Image` with an inert stub so tests can observe and drive
 * the preloading that `ImageFallback` performs with `new window.Image()`.
 * Call at `describe` scope; returns the probes in creation order. Each test
 * starts with an empty list and the real constructor is restored afterwards.
 */
export const stubImagePreload = () => {
  // Mutated in place on purpose: the caller captures this reference once at
  // describe scope, so clearing it between tests (rather than replacing the
  // array) is what keeps that reference live.
  const probes: ImagePreloadStub[] = []

  class TrackedImage extends ImagePreloadStub {
    constructor() {
      super()
      probes.push(this)
    }
  }

  beforeEach(() => {
    probes.length = 0
    vi.stubGlobal('Image', TrackedImage)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  return probes
}
