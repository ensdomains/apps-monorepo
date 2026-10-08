/**
 * Rhinestone provider barrel.
 *
 * Today Rhinestone is the only smart-account provider this package
 * implements. The `providers/<provider>/` layout exists so a future
 * second provider (custom AA, our own contracts, etc.) can land next
 * to this one without having to reshuffle the package — see the PR
 * discussion on https://github.com/ensdomains/apps-monorepo/pull/751
 * for the rationale.
 *
 * This is the STANDALONE-HCA surface. Registration is prompt-free via a scoped
 * ERC-7579 SmartSession on the standalone validator
 * (`HCAOwnerAndSessionValidator`): the wallet signs ONE multi-chain session
 * authorization up front and presents it with every session-signed intent (the
 * validator keeps no session state). The old ephemeral-OWNER model
 * (`updateConfig` add-owner) is gone.
 *
 * Exports: `initialize-account` (create/adopt the standalone HCA), `manifest`
 * (chain-keyed contract tables + salt derivation), `session` (multi-chain
 * session construction + enable-data), and `session-storage` (persistence).
 */

export {
  commitLegGasLimit,
  estimateHcaBudget,
  HCA_ACCOUNT_DEPLOY_GAS,
  HCA_LEG_GAS_LIMITS,
  HCA_MAX_LEG_FEES_USDC,
  HCA_PRIMARY_NAME_BASE_GAS,
  HCA_PRIMARY_NAME_WORD_GAS,
  HCA_RESOLVER_DEPLOY_GAS,
  type HcaBudgetBreakdown,
  HcaBudgetExceedsMaximumError,
  type HcaBudgetParams,
  type HcaLeg,
  hcaBudgetMaximum,
  primaryNameGas,
  type QuoteLegCostUsdc,
  type QuoteLegResult,
  type QuoteMarketData,
  type RegisterLegShape,
  registerLegGasLimit,
  withBudgetDrift,
} from './budget'
export {
  type BuildHcaDeploymentCallParams,
  buildHcaDeploymentCall,
  buildStandaloneAccountConfig,
  computeStandaloneHcaAddress,
  getHcaDirectExecutionReadiness,
  HcaDeploymentCallValidationError,
  type HcaDirectExecutionReadiness,
  type InitializeRhinestoneAccountParams,
  initializeRhinestoneAccount,
  type RhinestoneInitConfig,
  type RhinestoneInitError,
  type RhinestoneInitResult,
  type VerifyStandaloneHcaParams,
  verifyStandaloneHca,
} from './initialize-account'
export {
  fetchIntentOperationStatus,
  type IntentOperationStatus,
} from './intent-status'
export {
  computeResolverSalt,
  DEFAULT_SESSION_VALIDITY_SECONDS,
  DESTINATION_CONTRACTS,
  type DestinationContracts,
  getDestinationContracts,
  getSourceContracts,
  ONCHAIN_ACCOUNT_ID,
  ROLES_ALL,
  SHARED_CONTRACTS,
  type SharedContracts,
  SOURCE_CONTRACTS,
  type SourceContracts,
  STANDALONE_HCA_VERSION,
  USER_SALT,
} from './manifest'
export {
  type BuildHcaOwnerExecutionCallParams,
  buildHcaOwnerExecutionCall,
} from './owner-execution'
export {
  buildCommitCall,
  buildRevealBatch,
  buildUsdcApproveCall,
  type Call,
  computeResolverAddress,
  ethReverseName,
  type ResolverRecord,
  type RevealBatchParams,
  readCommitment,
  readCommitmentAges,
  readRegisterPrice,
} from './registration-calls'
export {
  buildRevokeSessionsCall,
  type RevokeSessionsParams,
  type RevokeSessionsResult,
  revokeSessionsOnChain,
} from './revoke-sessions'
export {
  buildHcaSessionConfig,
  type ChainDigest,
  computeDestinationSessionSalt,
  computeSourceSessionSalt,
  createDestinationSession,
  type DestinationSessionParams,
  type DestinationSessionResult,
  type HcaSessionConfig,
  rebuildDestinationSession,
  type SessionEnableData,
} from './session'
export {
  clearAllSessions,
  getAllSessions,
  getSession,
  getSessionByOwner,
  getSkippedStatus,
  getValidSession,
  getValidSessionByOwner,
  getValidSessionForAccount,
  hasRegistrationHeadroom,
  isSessionExpired,
  removeSession,
  removeSessionsByOwner,
  SESSION_REGISTRATION_HEADROOM_SECONDS,
  type SessionScope,
  saveSession,
  setSkippedStatus,
} from './session-storage'
export {
  buildHcaSessionEnablePayload,
  deserializeChainDigests,
  type HcaSessionEnablePayload,
  isRhinestoneSession,
  type RhinestoneStoredSession,
  serializeChainDigests,
} from './types'
