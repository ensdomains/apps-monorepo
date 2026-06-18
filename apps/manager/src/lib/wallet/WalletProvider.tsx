import { PrivyStack } from './stacks/PrivyStack'

// Thin entry for the wallet layer — mounts the vendor stack (Privy) so the
// vendor can be swapped here without touching RootProviders.
export const WalletProvider = ({ children }: { children: React.ReactNode }) => (
  <PrivyStack>{children}</PrivyStack>
)
