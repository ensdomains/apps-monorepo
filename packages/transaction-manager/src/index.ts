// Types
export type {
  TransactionType,
  TransactionRequest,
  TransactionIntent,
  ENSRenewalTransactionIntent,
  ETHTransferTransactionIntent,
  CustomTransactionIntent,
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
  Signer,
  EOASigner,
  RhinestoneSigner,
  ERC4337Signer,
  PrivySigner,
  SafeSigner
} from './types/signer.types'

export {
  isEOASigner,
  isRhinestoneSigner,
  isERC4337Signer
} from './types/signer.types'

export type {
  StateTransition,
  AuditEntry,
  DebugReport,
  ErrorSummary,
  PerformanceMetrics
} from './types/audit.types'

// Services
export { transactionManager } from './providers/transactionManager'
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

// Providers
export {
  TransactionManagerProvider,
  useTransactionManager,
  useTransaction,
  useActiveTransactions,
  useRecoveredTransactions,
  // Backward compatibility - deprecated
  useTransactionActorManager,
  useTransactionRegistry,
  TransactionManagerProvider as TransactionRegistryProvider,
} from './providers/TransactionManagerProvider'

// Hooks
// (None - use services directly)

// Helpers
export {
  getENSRenewalPrice,
} from './helpers/ens-renewal.helpers'

// Contracts
export { ENS_SEPOLIA_CONTRACTS, ETH_REGISTRAR_CONTROLLER_ABI } from './contracts/ens-sepolia'

// Persistence
export {
  saveTransaction,
  getTransaction,
  getAllTransactions,
  getPendingTransactions,
  removeTransaction,
  clearAllTransactions,
  archiveTransaction,
  getArchivedTransactions,
  getTransactionHistory,
  clearTransactionHistory,
  getHistoryCount,
  getActiveCount,
  exportAllData,
  getStorageType,
  type PersistedTransaction
} from './helpers/transaction-persistence'

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

// Errors
export {
  TransactionSubmissionError,
} from './errors/transaction.errors'