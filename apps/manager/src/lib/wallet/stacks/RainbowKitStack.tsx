import { RainbowKitProvider } from '@rainbow-me/rainbowkit'
import { WagmiProvider } from 'wagmi'
import { isMockWalletEnabled } from '@/lib/mockWallet.mock'
import { wagmiConfig } from '@/lib/wagmi'
import { MockWalletAutoConnect } from '../MockWalletAutoConnect'
import '@rainbow-me/rainbowkit/styles.css'

export const RainbowKitStack = ({
  children,
}: {
  children: React.ReactNode
}) => (
  <WagmiProvider config={wagmiConfig}>
    {isMockWalletEnabled && <MockWalletAutoConnect />}
    <RainbowKitProvider>{children}</RainbowKitProvider>
  </WagmiProvider>
)
