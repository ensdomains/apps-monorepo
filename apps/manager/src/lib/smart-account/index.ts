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
  RhinestoneAccountState,
  SmartAccountProvider,
  SmartAccountState,
  SmartAccountType,
  StablecoinBalance,
  UseSmartAccountConfig,
  WalletSource,
  ZeroDevAccountState,
} from './types'
// Deprecated hook - maintained for backward compatibility
export { useSmartAccount } from './useSmartAccount'
export {
  initializeZeroDevAccount,
  type ZeroDevConfig,
} from './zerodev/kernel'
