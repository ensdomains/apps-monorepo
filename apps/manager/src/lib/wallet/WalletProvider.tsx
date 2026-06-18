import { RainbowKitStack } from './stacks/RainbowKitStack'

// Thin entry for the wallet layer — mounts the vendor stack (RainbowKit today)
// so a second vendor can slot in here without touching RootProviders.
export const WalletProvider = ({ children }: { children: React.ReactNode }) => (
  <RainbowKitStack>{children}</RainbowKitStack>
)
