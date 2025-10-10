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
export { AuditTrailService } from './services/audit-trail.service'
export {
  RhinestoneAccountService,
  RhinestoneAccountError,
  type RhinestoneAccountConfig,
  type ENSRenewalParams,
  type GasPriceTier
} from './services/rhinestone-account.service'

// Machines
export { transactionMachine } from './machines/transaction.machine'

// Hooks
export { useAuditTrail, type UseAuditTrailReturn } from './hooks/useAuditTrail'

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