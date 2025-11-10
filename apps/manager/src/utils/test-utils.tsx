import { RainbowKitProvider } from '@rainbow-me/rainbowkit'
import {
  render as baseRender,
  type RenderOptions,
} from '@testing-library/react'
import { createConfig, mock, WagmiProvider } from 'wagmi'
import '@testing-library/jest-dom'
import { addEnsContracts } from '@ensdomains/ensjs'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { mainnet } from 'viem/chains'
import { beforeEach } from 'vitest'

import { hashFn } from 'wagmi/query'

const mainnetWithEns = addEnsContracts(mainnet)

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

beforeEach(() => queryClient.clear())

interface AllTheProvidersProps {
  children: React.ReactNode
}

const AllTheProviders = ({ children }: AllTheProvidersProps) => (
  <WagmiProvider config={wagmiConfig}>
    <QueryClientProvider client={queryClient}>
      <RainbowKitProvider>{children}</RainbowKitProvider>
    </QueryClientProvider>
  </WagmiProvider>
)

export const render = (ui: React.ReactNode, options?: RenderOptions) =>
  baseRender(ui, { wrapper: AllTheProviders, ...options })
