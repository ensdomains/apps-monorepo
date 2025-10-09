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
export { useTransaction, type UseTransactionReturn } from './hooks/useTransaction'
export { useAuditTrail, type UseAuditTrailReturn } from './hooks/useAuditTrail'
export { useENSRenewal, type UseENSRenewalOptions } from './hooks/useENSRenewal'
export { useTransactionModal, type UseTransactionModalReturn } from './hooks/useTransactionModal'

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