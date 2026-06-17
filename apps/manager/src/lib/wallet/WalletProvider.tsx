import type { QueryClientProvider } from '@tanstack/react-query'
import { RainbowKitStack } from './stacks/RainbowKitStack'

/**
 * The wallet layer. Mounts the wallet stack (RainbowKit) and renders `children`
 * inside it. The stack exposes a wagmi context + fills WalletUiContext, so the
 * rest of the app reads the wallet through the vendor-agnostic seam
 * (useConnectModal / useWalletUi) without knowing the vendor.
 */
export const WalletProvider = ({
  queryClient,
  children,
}: {
  queryClient: React.ComponentProps<typeof QueryClientProvider>['client']
  children: React.ReactNode
}) => <RainbowKitStack queryClient={queryClient}>{children}</RainbowKitStack>
