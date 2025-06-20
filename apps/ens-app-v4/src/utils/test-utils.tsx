import { ThemeProvider } from '@ensdomains/thorin'
import { RainbowKitProvider } from '@rainbow-me/rainbowkit'
import { type RenderOptions, render } from '@testing-library/react'
import { createConfig, mock, WagmiProvider } from 'wagmi'
import '@testing-library/jest-dom'
import { addEnsContracts } from '@ensdomains/ensjs'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { mainnet } from 'viem/chains'
import { beforeEach } from 'vitest'

import { hashFn } from 'wagmi/query'

const mainnetWithEns = {
  ...addEnsContracts(mainnet),
}

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

const AllTheProviders = ({ children }: { children: React.ReactNode }) => {
  return (
    <WagmiProvider config={wagmiConfig}>
      <RainbowKitProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>{children}</ThemeProvider>
        </QueryClientProvider>
      </RainbowKitProvider>
    </WagmiProvider>
  )
}

const customRender = (ui: React.ReactNode, options?: RenderOptions) =>
  render(ui, { wrapper: AllTheProviders, ...options })

export * from '@testing-library/react'
export { customRender as render }
