// Contracts
// Errors
export {
  SignerAddressMismatchError,
  TransactionSubmissionError,
} from './errors/transaction.errors'
// Helpers
export {
  createFlowScope,
  type FlowScope,
  scopeTransactionId,
} from './helpers/flow-identity'
export { getSmartAccountAddress } from './helpers/getSmartAccountAddress'
export {
  HCA_MAX_STANDALONE_INTENT_FEE_USDC,
  HCA_STANDALONE_INTENT_GAS_LIMIT,
  HcaFundingDeclinedError,
  type HcaFundingPrompt,
  HcaIntentFeeExceedsMaximumError,
  type HcaIntentFunding,
  type PlanHcaIntentFundingParams,
  planHcaIntentFunding,
} from './helpers/hca-intent-funding'
export { pollTransactionStatus } from './helpers/pollTransactionStatus.actor'
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
  waitForTransactionHash,
} from './helpers/waitForTransaction'
export {
  encodeDeployDedicatedResolverCall,
  encodeRegisterCall,
  type TOKEN_SYMBOL,
  VERIFY_GRACE_WINDOW_MS,
  VERIFY_POLL_INTERVAL_MS,
} from './machines/registration/registration.actors'
export type {
  RegistrationContext,
  RegistrationEvent,
  RegistrationInput,
} from './machines/registration/registration.machine'
export {
  REGISTRATION_TX_IDS,
  registrationMachine,
} from './machines/registration/registration.machine'
// Registration persistence & resume
export type {
  PersistedRegistrationContext,
  PersistedRegistrationRecord,
  RegistrationPersistenceAdapter,
  ResumeTarget,
} from './machines/registration/registration.persistence'
export {
  buildRegistrationRecord,
  getResumeTarget,
  parseRegistrationRecord,
  REGISTRATION_PERSISTENCE_VERSION,
  serializeRegistrationContext,
  serializeRegistrationRecord,
  subscribeRegistrationPersistence,
} from './machines/registration/registration.persistence'
export type {
  RegistrationMachineActor,
  RegistrationMachineEvent,
  RegistrationMachineState,
} from './machines/registration/registration.types'
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
  useActiveTransactions,
  useRecoveredTransactions,
  useTransaction,
  useTransactionManager,
} from './providers/TransactionManagerProvider'
// Services
export {
  type ArchivedTransaction,
  buildArchivedTransaction,
  transactionManager,
} from './providers/transactionManager'
export type {
  FailedRunPayloadV2,
  RunTelemetryEventSubscriber,
  RunTelemetrySubscriber,
  SerializedRunError,
  TransactionPhase,
  TransactionRunEventV2,
  TransactionRunInitialSnapshot,
  TransactionRunStatus,
} from './types/audit.types'
export type {
  EOASigner,
  RhinestoneSessionContext,
  RhinestoneSigner,
  Signer,
  TransactionInfra,
} from './types/signer.types'
export type {
  Call,
  CustomTransactionIntent,
  ENSRenewalTransactionIntent,
  EOATransactionRequest,
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
} from './types/transaction.types'
export { getPrimaryCall } from './types/transaction.types'
