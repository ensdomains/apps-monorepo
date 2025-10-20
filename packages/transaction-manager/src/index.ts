// Types
export type {
  TransactionType,
  TransactionRequest,
  EOATransactionRequest,
  ERC4337UserOperation,
  TransactionOptions,
  TransactionResult,
  PaymentMethod,
  PaymentOption,
  TransactionStep,
  TransactionFlowType,
  TransactionModalState
} from './types/transaction.types'

export type {
  StateTransition,
  AuditEntry,
  DebugReport,
  ErrorSummary,
  PerformanceMetrics
} from './types/audit.types'

// Services
export { TransactionService } from './services/transaction.service'
export {
  recordTransition,
  addAuditEntry,
  getTransitionHistory,
  generateDebugReport,
  exportToJson,
  importFromJson,
  clearAuditTrail
} from './services/audit-trail.service'
export {
  initializeRhinestoneAccount,
  executeENSRenewal,
  getENSRenewalPrice as getRhinestoneRenewalPrice,
  getRhinestoneAccountAddress,
  prepareENSRenewalTransaction,
  RhinestoneAccountError,
  type RhinestoneAccountConfig,
  type ENSRenewalParams,
  type GasPriceTier
} from './helpers/rhinestone-account.helpers'

// Machines
export { transactionMachine } from './machines/transaction.machine'
export { transactionRegistryMachine } from './machines/transaction-registry.machine'

// Providers
export {
  TransactionRegistryProvider,
  useTransactionRegistry,
  useTransaction,
  useActiveTransactions,
  useRecoveredTransactions
} from './providers/TransactionRegistryProvider'

// Hooks
// (None - use services directly)

// Helpers
export {
  prepareENSRenewal,
  getENSRenewalPrice,
  getRhinestoneSmartAccountAddress,
  type PrepareENSRenewalParams,
  type ENSRenewalTransactionData,
} from './helpers/ens-renewal.helpers'

// Contracts
export { ENS_SEPOLIA_CONTRACTS, ETH_REGISTRAR_CONTROLLER_ABI } from './contracts/ens-sepolia'

// Components
export {
  TransactionModal,
  TransactionModalHeader,
  TransactionSteps,
  TransactionDetails,
  PaymentSelector,
  type TransactionModalProps,
  type TransactionModalHeaderProps,
  type TransactionStepsProps,
  type TransactionDetailsProps,
  type PaymentSelectorProps
} from './components/TransactionModal'
export {
  TransactionRecoveryNotification,
  type TransactionRecoveryNotificationProps
} from './components/TransactionRecoveryNotification'
export {
  GlobalTransactionToasts,
  type GlobalTransactionToastsProps,
  type Toast
} from './components/GlobalTransactionToasts'
export {
  TransactionStatusPanel,
  type TransactionStatusPanelProps,
  type TransactionStatus
} from './components/TransactionStatusPanel'

// Persistence
export {
  saveActiveTransaction,
  getActiveTransactions,
  getActiveTransaction,
  removeActiveTransaction,
  archiveTransaction,
  getTransactionHistory,
  clearActiveTransactions,
  clearTransactionHistory,
  getHistoryCount,
  getActiveCount,
  exportAllData,
  type PersistedTransaction
} from './helpers/transaction-persistence'

// Errors
export {
  TransactionSubmissionError,
  TransactionTimeoutError,
  TransactionRevertedError,
  GasEstimationError,
  EthCallFallbackError,
  UserOperationError,
  PersistenceError,
  ImportError
} from './errors/transaction.errors'