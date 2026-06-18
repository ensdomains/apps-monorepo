import { RainbowKitProvider } from '@rainbow-me/rainbowkit'
import { WagmiProvider } from 'wagmi'
import { wagmiConfig } from '@/lib/wagmi'
import '@rainbow-me/rainbowkit/styles.css'

export const RainbowKitStack = ({
  children,
}: {
  children: React.ReactNode
}) => (
  <WagmiProvider config={wagmiConfig}>
    <RainbowKitProvider>{children}</RainbowKitProvider>
  </WagmiProvider>
)
