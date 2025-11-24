'use client'

import { PrivyProvider } from '@privy-io/react-auth'
import { WagmiProvider } from '@privy-io/wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { createConfig, http } from 'wagmi'
import { injected, walletConnect } from 'wagmi/connectors'
import { customSepolia, SEPOLIA_RPC_URL } from './wagmi'

const queryClient = new QueryClient()

const privyAppId = import.meta.env.VITE_PRIVY_APP_ID

if (!privyAppId) {
  throw new Error('Privy App ID is not defined. Please set VITE_PRIVY_APP_ID')
}

const wagmiConfig = createConfig({
  chains: [customSepolia],
  connectors: [
    injected(),
    walletConnect({
      projectId: '21fef48091f12692cad574a6f7753643',
    }),
  ],
  transports: {
    [customSepolia.id]: http(SEPOLIA_RPC_URL),
  },
})

export function PrivyContextProvider({ children }: { children: ReactNode }) {
  return (
    <PrivyProvider
      appId={privyAppId}
      config={{
        embeddedWallets: {
          createOnLogin: 'users-without-wallets',
        },
        loginMethods: ['wallet', 'email'],
        externalWallets: {
          walletConnect: { enabled: false },
        },
        appearance: {
          theme: 'light',
          accentColor: '#3b82f6',
        },
        defaultChain: customSepolia,
        supportedChains: [customSepolia],
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>{children}</WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  )
}
