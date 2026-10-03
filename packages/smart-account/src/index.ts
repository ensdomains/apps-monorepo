/**
 * @ens-apps/smart-account
 *
 * Shared smart-account helpers for ENS apps — the STANDALONE-HCA
 * implementation on the patched Rhinestone SDK (`@rhinestone/sdk@1.8.0` +
 * standalone-HCA patch).
 *
 * The standalone HCA (`type: 'hca', version: 'ens-standalone-1.1.0'`) is a
 * single-ECDSA-owner account with a scoped-SmartSession validator
 * (`HCAOwnerAndSessionValidator`). Prompt-free registration works by signing
 * ONE multi-chain session authorization up front (before route selection) and
 * presenting it with every session-signed intent — the validator is stateless,
 * so there is no ENABLE transaction or call. This replaces
 * the old ephemeral-owner (`updateConfig` add-owner) model entirely.
 *
 * App-specific concerns (wallet wrapping, wagmi config, i18n, env vars) stay in
 * the consuming app and are injected via the exported params types. Provider
 * code lives under `providers/<provider>/`; this root barrel re-exports the
 * current provider's surface.
 */

export {
  AccountInitError,
  AccountVerificationError,
  SessionEnableError,
  SessionRestoreError,
  SessionRevokeError,
  type SessionRevokeReason,
} from './errors'
export {
  type BuildHcaDeploymentCallParams,
  type BuildHcaOwnerExecutionCallParams,
  buildCommitCall,
  buildHcaDeploymentCall,
  buildHcaOwnerExecutionCall,
  buildHcaSessionConfig,
  buildHcaSessionEnablePayload,
  buildRevealBatch,
  buildRevokeSessionsCall,
  buildStandaloneAccountConfig,
  buildUsdcApproveCall,
  type Call,
  type ChainDigest,
  clearAllSessions,
  computeDestinationSessionSalt,
  computeResolverAddress,
  computeResolverSalt,
  computeSourceSessionSalt,
  computeStandaloneHcaAddress,
  createDestinationSession,
  DEFAULT_SESSION_VALIDITY_SECONDS,
  DESTINATION_CONTRACTS,
  type DestinationContracts,
  type DestinationSessionParams,
  type DestinationSessionResult,
  deserializeChainDigests,
  estimateHcaBudget,
  ethReverseName,
  fetchIntentOperationStatus,
  getAllSessions,
  getDestinationContracts,
  getHcaDirectExecutionReadiness,
  getSession,
  getSessionByOwner,
  getSkippedStatus,
  getSourceContracts,
  getValidSession,
  getValidSessionByOwner,
  getValidSessionForAccount,
  HCA_LEG_GAS_LIMITS,
  HCA_MAX_LEG_FEES_USDC,
  HCA_PRIMARY_NAME_BASE_GAS,
  HCA_PRIMARY_NAME_WORD_GAS,
  HCA_RESOLVER_DEPLOY_GAS,
  type HcaBudgetBreakdown,
  HcaBudgetExceedsMaximumError,
  type HcaBudgetParams,
  HcaDeploymentCallValidationError,
  type HcaDirectExecutionReadiness,
  type HcaLeg,
  type HcaSessionConfig,
  type HcaSessionEnablePayload,
  hasRegistrationHeadroom,
  hcaBudgetMaximum,
  type InitializeRhinestoneAccountParams,
  type IntentOperationStatus,
  initializeRhinestoneAccount,
  isRhinestoneSession,
  isSessionExpired,
  ONCHAIN_ACCOUNT_ID,
  primaryNameGas,
  type QuoteLegResult,
  type QuoteMarketData,
  type RegisterLegShape,
  type ResolverRecord,
  type RevealBatchParams,
  type RevokeSessionsParams,
  type RevokeSessionsResult,
  type RhinestoneInitConfig,
  type RhinestoneInitError,
  type RhinestoneInitResult,
  type RhinestoneStoredSession,
  ROLES_ALL,
  readCommitment,
  readCommitmentAges,
  readRegisterPrice,
  rebuildDestinationSession,
  registerLegGasLimit,
  removeSession,
  removeSessionsByOwner,
  revokeSessionsOnChain,
  SESSION_REGISTRATION_HEADROOM_SECONDS,
  type SessionEnableData,
  type SessionScope,
  SHARED_CONTRACTS,
  type SharedContracts,
  SOURCE_CONTRACTS,
  type SourceContracts,
  STANDALONE_HCA_VERSION,
  saveSession,
  serializeChainDigests,
  setSkippedStatus,
  USER_SALT,
  type VerifyStandaloneHcaParams,
  verifyStandaloneHca,
  withBudgetDrift,
} from './providers/rhinestone'
export type { BaseStoredSession } from './types'
export {
  type ComputeVerifiableProxyAddressParams,
  computeVerifiableProxyAddress,
} from './verifiable-factory'
