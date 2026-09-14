import type { ReactNode } from 'react'
import { createClient, http } from 'viem'
import { mainnet } from 'viem/chains'
import { createConfig, mock, WagmiProvider } from 'wagmi'
import { SmartAccountContextProvider } from '@/lib/smart-account'

// Storybook's preview only wires TanStack Query and Lingui. The migration
// surfaces also read wagmi and the smart-account context, so stories mount a
// disconnected mock connector and never touch a real chain.
const wagmiConfig = createConfig({
  connectors: [
    mock({ accounts: ['0x0000000000000000000000000000000000000001'] }),
  ],
  chains: [mainnet],
  multiInjectedProviderDiscovery: false,
  storage: null,
  client: () =>
    createClient({ transport: http('http://mock.local'), chain: mainnet }),
})

export const MigrationStoryProviders = ({
  children,
}: {
  readonly children: ReactNode
}) => (
  <WagmiProvider config={wagmiConfig} reconnectOnMount={false}>
    <SmartAccountContextProvider>{children}</SmartAccountContextProvider>
  </WagmiProvider>
)
