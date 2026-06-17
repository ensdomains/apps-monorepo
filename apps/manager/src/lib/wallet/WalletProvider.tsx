import type { QueryClientProvider } from '@tanstack/react-query'
import { RainbowKitStack } from './stacks/RainbowKitStack'

// Thin entry for the wallet layer — mounts the vendor stack (RainbowKit today)
// so a second vendor can slot in here without touching RootProviders.
export const WalletProvider = ({
  queryClient,
  children,
}: {
  queryClient: React.ComponentProps<typeof QueryClientProvider>['client']
  children: React.ReactNode
}) => <RainbowKitStack queryClient={queryClient}>{children}</RainbowKitStack>
