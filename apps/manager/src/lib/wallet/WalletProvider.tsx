import { CustomWalletStack } from './stacks/CustomWalletStack'

// Provides wallet transport; RootProviders composes dialogs below the smart-account provider.
export const WalletProvider = ({ children }: { children: React.ReactNode }) => (
  <CustomWalletStack>{children}</CustomWalletStack>
)
