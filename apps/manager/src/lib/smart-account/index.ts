export { initializePimlicoAccount, type PimlicoConfig } from './pimlico'
export {
  initializeRhinestoneAccount,
  type RhinestoneConfig,
} from './rhinestone'
// Context-based smart account (shared state across components)
export {
  SmartAccountContextProvider,
  useSmartAccountContext,
  useSmartAccountContextSafe,
} from './SmartAccountContext'
export type {
  EthBalance,
  KernelAccountState,
  PimlicoAccountState,
  RhinestoneAccountState,
  SmartAccountProvider,
  SmartAccountState,
  SmartAccountType,
  StablecoinBalance,
  UseSmartAccountConfig,
  WalletSource,
} from './types'
// Deprecated hook - maintained for backward compatibility
export { useSmartAccount } from './useSmartAccount'
