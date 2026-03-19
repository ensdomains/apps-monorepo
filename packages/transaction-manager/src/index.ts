// Types

export {
  GlobalTransactionToasts,
  type GlobalTransactionToastsProps,
  type Toast,
} from './components/GlobalTransactionToasts'
// Components
export {
  PaymentSelector,
  type PaymentSelectorProps,
  TransactionDetails,
  type TransactionDetailsProps,
  TransactionModal,
  TransactionModalHeader,
  type TransactionModalHeaderProps,
  type TransactionModalProps,
  TransactionSteps,
  type TransactionStepsProps,
} from './components/TransactionModal'
export {
  TransactionRecoveryNotification,
  type TransactionRecoveryNotificationProps,
} from './components/TransactionRecoveryNotification'
export {
  type TransactionStatus,
  TransactionStatusPanel,
  type TransactionStatusPanelProps,
} from './components/TransactionStatusPanel'
export { ETH_REGISTRAR_CONTROLLER_ABI } from './contracts/abis/ETHRegistrarController.abi'
// Contracts
export { ENS_SEPOLIA_CONTRACTS } from './contracts/ens-sepolia'
// Errors
export { TransactionSubmissionError } from './errors/transaction.errors'
// Helpers
export { pollTransactionStatus } from './helpers/pollTransactionStatus.actor'
export {
  type ENSRenewalParams,
  executeENSRenewal,
  type GasPriceTier,
  getENSRenewalPrice as getRhinestoneRenewalPrice,
  getENSRenewalPrice,
  getRhinestoneAccountAddress,
  initializeRhinestoneAccount,
  prepareENSRenewalTransaction,
  type RhinestoneAccountConfig,
  RhinestoneAccountError,
} from './helpers/rhinestone-account.helpers'
// Persistence
export {
  archiveTransaction,
  clearAllTransactions,
  clearTransactionHistory,
  exportAllData,
  getActiveCount,
  getAllTransactions,
  getArchivedTransactions,
  getHistoryCount,
  getPendingTransactions,
  getStorageType,
  getTransaction,
  getTransactionHistory,
  type PersistedTransaction,
  removeTransaction,
  saveTransaction,
} from './helpers/transaction-persistence'
export {
  type WaitForTransactionResult,
  waitForTransaction,
} from './helpers/waitForTransaction'
export type {
  PrimaryNameContext,
  PrimaryNameEvent,
  PrimaryNameInput,
} from './machines/primary-name/primaryName.machine'
export { primaryNameMachine } from './machines/primary-name/primaryName.machine'
export {
  generateCommitmentActor,
  resolveResolverDeploymentActor,
  submitApprovalActor,
  submitCommitmentActor,
  submitRegistrationActor,
  submitResolverDeploymentActor,
  validateCommitmentActor,
} from './machines/registration/registration.actors'
export type {
  RegistrationContext,
  RegistrationEvent,
  RegistrationInput,
} from './machines/registration/registration.machine'
export { registrationMachine } from './machines/registration/registration.machine'
export type {
  RegistrationMachineActor,
  RegistrationMachineEvent,
  RegistrationMachineState,
} from './machines/registration/registration.types'
export type {
  ResolverContext,
  ResolverEvent,
  ResolverInput,
} from './machines/resolver/resolver.machine'
export { resolverMachine } from './machines/resolver/resolver.machine'
// Machines
export { transactionMachine } from './machines/transaction.machine'
export type {
  TransactionMachineActor,
  TransactionMachineEvent,
  TransactionMachineState,
} from './machines/transaction.types'
// Providers
export {
  TransactionManagerProvider,
  TransactionManagerProvider as TransactionRegistryProvider,
  useActiveTransactions,
  useRecoveredTransactions,
  useTransaction,
  // Backward compatibility - deprecated
  useTransactionActorManager,
  useTransactionManager,
  useTransactionRegistry,
} from './providers/TransactionManagerProvider'
// Services
export {
  estimateTelemetryBytes,
  transactionManager,
} from './providers/transactionManager'
export {
  addAuditEntry,
  clearAuditTrail,
  exportToJson,
  generateDebugReport,
  getTransitionHistory,
  importFromJson,
  recordTransition,
} from './services/audit-trail.service'
export type {
  AuditEntry,
  DebugReport,
  ErrorSummary,
  FailedRunPayloadV2,
  PerformanceMetrics,
  RunTelemetryEventSubscriber,
  RunTelemetrySubscriber,
  SerializedRunError,
  StateTransition,
  TransactionPhase,
  TransactionRunEventV2,
  TransactionRunInitialSnapshot,
  TransactionRunStatus,
} from './types/audit.types'
export type {
  EOASigner,
  ERC4337Signer,
  PrivySigner,
  RhinestoneSigner,
  SafeSigner,
  Signer,
  ZeroDevSigner,
} from './types/signer.types'
export {
  isEOASigner,
  isERC4337Signer,
  isRhinestoneSigner,
  isZeroDevSigner,
} from './types/signer.types'
export type {
  CustomTransactionIntent,
  ENSRenewalTransactionIntent,
  EOATransactionRequest,
  ERC4337UserOperation,
  ETHTransferTransactionIntent,
  PaymentMethod,
  PaymentOption,
  RhinestoneTransactionRequest,
  SmartAccountConfig,
  TransactionFlowType,
  TransactionIntent,
  TransactionModalState,
  TransactionOptions,
  TransactionRequest,
  TransactionResult,
  TransactionStep,
  TransactionType,
  ZeroDevTransactionRequest,
} from './types/transaction.types'
