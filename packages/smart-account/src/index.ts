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
 * ONE multi-chain session authorization up front (before route selection), then
 * enabling the session lazily inside the first HCA action via
 * `enableSessionWithRefund(...)` — no separate ENABLE transaction. This replaces
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
} from './errors'
export {
  buildCommitCall,
  buildEnableSessionWithRefundCall,
  buildHcaSessionEnablePayload,
  buildRevealBatch,
  buildStandaloneAccountConfig,
  buildUsdcApproveCall,
  type Call,
  type ChainDigest,
  clearAllSessions,
  computeDestinationSessionSalt,
  computeResolverAddress,
  computeResolverSalt,
  computeSourceSessionSalt,
  createDestinationSession,
  createMultiChainSessions,
  createSourceNexus,
  DEFAULT_SESSION_VALIDITY_SECONDS,
  DESTINATION_CONTRACTS,
  type DestinationContracts,
  type DestinationSessionParams,
  type DestinationSessionResult,
  deserializeChainDigests,
  estimateHcaBudget,
  ethReverseName,
  getAllSessions,
  getDestinationContracts,
  getSession,
  getSessionByOwner,
  getSkippedStatus,
  getSourceContracts,
  getValidSession,
  getValidSessionByOwner,
  getValidSessionForAccount,
  HCA_LEG_GAS_LIMITS,
  HCA_PRIMARY_NAME_BASE_GAS,
  HCA_PRIMARY_NAME_WORD_GAS,
  type HcaBudgetBreakdown,
  type HcaBudgetParams,
  type HcaLeg,
  type HcaSessionEnablePayload,
  hasRegistrationHeadroom,
  type InitializeRhinestoneAccountParams,
  initializeRhinestoneAccount,
  isRhinestoneSession,
  isSessionExpired,
  type MultiChainSessionParams,
  type MultiChainSessionResult,
  ONCHAIN_ACCOUNT_ID,
  primaryNameGas,
  type QuoteLegResult,
  type QuoteMarketData,
  type ResolverRecord,
  type RevealBatchParams,
  type RhinestoneInitConfig,
  type RhinestoneInitResult,
  type RhinestoneStoredSession,
  readCommitment,
  readCommitmentAges,
  readRegisterPrice,
  rebuildDestinationSession,
  rebuildSourceSession,
  registerLegGasLimit,
  removeSession,
  removeSessionsByOwner,
  SESSION_REGISTRATION_HEADROOM_SECONDS,
  type SessionEnableData,
  type SessionScope,
  SHARED_CONTRACTS,
  type SharedContracts,
  SOURCE_CONTRACTS,
  type SourceContracts,
  type SourceNexusParams,
  type SourceNexusResult,
  type SourceSessionParams,
  type SourceSessionResult,
  STANDALONE_HCA_VERSION,
  saveSession,
  serializeChainDigests,
  setSkippedStatus,
  USER_SALT,
} from './providers/rhinestone'
export type { BaseStoredSession } from './types'
