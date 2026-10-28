export {
  initializeRhinestoneAccount,
  type RhinestoneConfig,
} from './rhinestone'
// Context-based smart account (shared state across components)
export {
  SmartAccountContextProvider,
  type SmartAccountContextValue,
  useSmartAccountContext,
  useSmartAccountContextSafe,
} from './SmartAccountContext'
export {
  selectIsLoading,
  selectIsReady,
  smartAccountMachine,
} from './smart-account.machine'
export type {
  RhinestoneAccountState,
  SmartAccountState,
  StablecoinBalance,
  WalletSource,
} from './types'
export {
  type UseHcaFundingPromptResult,
  useHcaFundingPrompt,
} from './useHcaFundingPrompt'
