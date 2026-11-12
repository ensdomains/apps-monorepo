------------------------------ MODULE Model ------------------------------
EXTENDS FiniteSets, Naturals

CONSTANTS ModelMode, DisabledGuard, EnabledScenarios

Tabs == {"tab-1", "tab-2"}
Names == {"root.eth", "child.root.eth"}
Root == "root.eth"
Child == "child.root.eth"
Actions == {"migrate", "copy", "none"}
Roles == {"owner", "wrapper-root", "manager", "extra"}
Approvals == {"registration", "wrapper", "manager"}
Work == {"migration", "grace", "wrapper", "cleanup"}
Outcomes == {"none", "success", "failure", "partial", "blocked"}
ReceiptOutcomes == {"none", "success", "reverted", "unavailable", "absent"}
Lifecycle == {"idle", "running", "blocked", "success", "failure"}
Authorities == {"old-manager", "current-manager", "owner", "none"}

Behaviours == {
  "A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8",
  "B1", "B2", "B3", "B4", "B5", "B6",
  "C1", "C2", "C3", "C4", "C5", "C6",
  "D1", "D2", "D3", "D4", "D5",
  "E1", "E2", "E3", "E4", "E5", "E6",
  "F1", "G1", "G2", "G3", "G4", "G5"
}

AllScenarios == Behaviours \cup {"CORE"}

Guards == {
  "ScopeExecutionLock",
  "SubmissionAbortGate",
  "IntentRecoveryBeforePrompt",
  "HashJournalBeforeIntentDrop",
  "ReceiptAbsenceProof",
  "RevertedSourceOwnership",
  "RejectionIntentCleanup",
  "ApprovalPlanAndCleanup",
  "PerBatchFreshness",
  "CurrentAuthorityOnly",
  "LiveSubregistryGuard",
  "LockedResolverControl",
  "ExactRoleVerification",
  "CertifiedRegistryTraversal",
  "ReceiptAndPostStateProof",
  "CheckpointBeforeJournalDelete",
  "ImmutableOperationIdentity",
  "CompleteWorkAccounting",
  "TruthfulOutcomeAndRefresh",
  "HistoricalNoResubmit",
  "SemanticRetryIdentity",
  "SnapshotCleanupCompare",
  "JournalAtomicWrite",
  "CleanupOnlyRunnable",
  "UncertaintyRetainsEvidence",
  "AtomicNameTree",
  "ReplayDeduplication",
  "TotalClassification",
  "CopyRouteGuard",
  "UnknownLabelConsentCap",
  "ChainTimeExpiry",
  "RenewalFundingAndLock",
  "FailureRouting",
  "FairPendingResolution",
  "RetryEligibility",
  "DynamicProgressAccounting",
  "Recoverability"
}

CurrentMissingGuards == {
  "ScopeExecutionLock",
  "ReceiptAbsenceProof",
  "ApprovalPlanAndCleanup",
  "ExactRoleVerification",
  "CertifiedRegistryTraversal",
  "CompleteWorkAccounting",
  "TruthfulOutcomeAndRefresh",
  "SemanticRetryIdentity",
  "SnapshotCleanupCompare",
  "JournalAtomicWrite",
  "TotalClassification",
  "ChainTimeExpiry",
  "Recoverability"
}

ASSUME /\ ModelMode \in {"current", "hardened"}
       /\ DisabledGuard \in Guards \cup {"None"}
       /\ EnabledScenarios \subseteq AllScenarios
       /\ EnabledScenarios # {}

GuardEnabled(guard) ==
  /\ guard # DisabledGuard
  /\ (ModelMode = "hardened" \/ ~(guard \in CurrentMissingGuards))

DefaultState == [
  phase |-> 0,
  lifecycle |-> "idle",
  promptingTabs |-> {},
  promptCount |-> 0,
  promptCountAtCancel |-> 0,
  cancelled |-> FALSE,
  intents |-> {},
  submissions |-> {},
  recoveryNames |-> {},
  checkpointNames |-> {},
  remainingNames |-> Names,
  completedNames |-> {},
  verifiedNames |-> {},
  unresolvedNames |-> {},
  blockedNames |-> {},
  temporaryGrantLive |-> FALSE,
  cleanupRequired |-> FALSE,
  completionClaimed |-> FALSE,
  previewApprovals |-> {},
  actualApprovals |-> {},
  sourceOwned |-> TRUE,
  retried |-> FALSE,
  userRejected |-> FALSE,
  hashKnown |-> FALSE,
  receiptOutcome |-> "none",
  evidencePreserved |-> TRUE,
  plannedAction |-> "migrate",
  actualAction |-> "migrate",
  sourceFresh |-> TRUE,
  copyReady |-> TRUE,
  subnamesSupported |-> TRUE,
  recreationCurrent |-> TRUE,
  currentAuthority |-> "owner",
  restoredAuthority |-> "owner",
  managerOptIn |-> FALSE,
  liveSubregistry |-> FALSE,
  subregistryPreserved |-> TRUE,
  lockedResolverCertified |-> TRUE,
  recordControl |-> TRUE,
  plannedRoles |-> {},
  actualRoles |-> {},
  registryPathCertified |-> TRUE,
  receiptSuccessful |-> FALSE,
  verifiedAtReceipt |-> FALSE,
  graceDone |-> FALSE,
  wrapperSyncDone |-> FALSE,
  cleanupDone |-> FALSE,
  outcome |-> "none",
  cacheFresh |-> TRUE,
  historicalEvidence |-> FALSE,
  planWork |-> Work,
  remainingWork |-> Work,
  completedWork |-> {},
  treeSubmittedParts |-> 0,
  replayCount |-> 0,
  inputNames |-> Names,
  classifiedNames |-> {},
  ineligibleNames |-> {},
  skippedNames |-> {},
  copyRouteExists |-> TRUE,
  copied |-> FALSE,
  unknownDropCount |-> 0,
  unknownConsent |-> FALSE,
  expiryFromChain |-> TRUE,
  expiredOnChain |-> FALSE,
  renewalCount |-> 0,
  balanceSufficient |-> TRUE,
  otherRenewalActive |-> FALSE,
  retryOffered |-> FALSE,
  deterministicFailure |-> FALSE,
  progressCurrent |-> 0,
  progressTotal |-> 0,
  actualPrompts |-> 0,
  runSettled |-> FALSE
]

VARIABLES scenario, state

vars == <<scenario, state>>

Init ==
  /\ scenario \in EnabledScenarios
  /\ state = DefaultState

SetState(next) ==
  /\ state' = next
  /\ UNCHANGED scenario

A1FirstPrompt ==
  /\ scenario = "A1"
  /\ state.phase = 0
  /\ SetState([state EXCEPT
       !.phase = 1,
       !.lifecycle = "running",
       !.promptingTabs = {"tab-1"},
       !.promptCount = 1])

A1SecondPrompt ==
  /\ scenario = "A1"
  /\ state.phase = 1
  /\ SetState(
       IF GuardEnabled("ScopeExecutionLock")
         THEN [state EXCEPT !.phase = 99, !.lifecycle = "blocked"]
         ELSE [state EXCEPT
           !.phase = 99,
           !.promptingTabs = Tabs,
           !.promptCount = 2])

A2Prompt ==
  /\ scenario = "A2"
  /\ state.phase = 0
  /\ SetState([state EXCEPT
       !.phase = 1,
       !.lifecycle = "running",
       !.promptCount = 1,
       !.promptingTabs = {"tab-1"}])

A2CancelAndContinue ==
  /\ scenario = "A2"
  /\ state.phase = 1
  /\ SetState(
       IF GuardEnabled("SubmissionAbortGate")
         THEN [state EXCEPT
           !.phase = 99,
           !.cancelled = TRUE,
           !.promptCountAtCancel = state.promptCount,
           !.promptingTabs = {},
           !.lifecycle = "failure"]
         ELSE [state EXCEPT
           !.phase = 99,
           !.cancelled = TRUE,
           !.promptCountAtCancel = state.promptCount,
           !.promptCount = state.promptCount + 1,
           !.promptingTabs = {"tab-2"}])

A3OpenPrompt ==
  /\ scenario = "A3"
  /\ state.phase = 0
  /\ SetState(
       IF GuardEnabled("IntentRecoveryBeforePrompt")
         THEN [state EXCEPT
           !.phase = 99,
           !.lifecycle = "running",
           !.intents = {Root},
           !.recoveryNames = Names,
           !.promptingTabs = {"tab-1"},
           !.promptCount = 1]
         ELSE [state EXCEPT
           !.phase = 99,
           !.lifecycle = "running",
           !.promptingTabs = {"tab-1"},
           !.promptCount = 1])

A4RecordHash ==
  /\ scenario = "A4"
  /\ state.phase = 0
  /\ SetState(
       IF GuardEnabled("HashJournalBeforeIntentDrop")
         THEN [state EXCEPT
           !.phase = 99,
           !.hashKnown = TRUE,
           !.intents = {},
           !.submissions = {Root},
           !.recoveryNames = Names]
         ELSE [state EXCEPT
           !.phase = 99,
           !.hashKnown = TRUE,
           !.intents = {},
           !.submissions = {}])

A5MissingReceipt ==
  /\ scenario = "A5"
  /\ state.phase = 0
  /\ SetState(
       IF GuardEnabled("ReceiptAbsenceProof")
         THEN [state EXCEPT
           !.phase = 99,
           !.lifecycle = "blocked",
           !.receiptOutcome = "unavailable",
           !.submissions = {Root},
           !.recoveryNames = Names,
           !.unresolvedNames = {Root},
           !.blockedNames = {Root},
           !.promptCount = 1]
         ELSE [state EXCEPT
           !.phase = 99,
           !.lifecycle = "running",
           !.receiptOutcome = "unavailable",
           !.submissions = {},
           !.recoveryNames = Names,
           !.promptCount = 2])

A6RevertedAttempt ==
  /\ scenario = "A6"
  /\ state.phase = 0
  /\ SetState(
       IF GuardEnabled("RevertedSourceOwnership")
         THEN [state EXCEPT
           !.phase = 99,
           !.sourceOwned = FALSE,
           !.retried = FALSE,
           !.lifecycle = "blocked"]
         ELSE [state EXCEPT
           !.phase = 99,
           !.sourceOwned = FALSE,
           !.retried = TRUE,
           !.promptCount = 2])

A7RejectWithoutHash ==
  /\ scenario = "A7"
  /\ state.phase = 0
  /\ SetState(
       IF GuardEnabled("RejectionIntentCleanup")
         THEN [state EXCEPT
           !.phase = 99,
           !.userRejected = TRUE,
           !.hashKnown = FALSE,
           !.intents = {},
           !.recoveryNames = Names,
           !.checkpointNames = {Child},
           !.evidencePreserved = TRUE]
         ELSE [state EXCEPT
           !.phase = 99,
           !.userRejected = TRUE,
           !.hashKnown = FALSE,
           !.intents = {},
           !.recoveryNames = {},
           !.checkpointNames = {},
           !.evidencePreserved = FALSE])

A8RejectAfterGrant ==
  /\ scenario = "A8"
  /\ state.phase = 0
  /\ SetState(
       IF GuardEnabled("ApprovalPlanAndCleanup")
         THEN [state EXCEPT
           !.phase = 99,
           !.previewApprovals = {"registration"},
           !.actualApprovals = {"registration"},
           !.userRejected = TRUE,
           !.temporaryGrantLive = FALSE,
           !.cleanupRequired = FALSE,
           !.cleanupDone = TRUE]
         ELSE [state EXCEPT
           !.phase = 99,
           !.previewApprovals = {"registration"},
           !.actualApprovals = {"registration"},
           !.userRejected = TRUE,
           !.temporaryGrantLive = TRUE,
           !.cleanupRequired = TRUE,
           !.cleanupDone = FALSE])

B1SourceChanges ==
  /\ scenario = "B1"
  /\ state.phase = 0
  /\ SetState(
       IF GuardEnabled("PerBatchFreshness")
         THEN [state EXCEPT
           !.phase = 99,
           !.sourceFresh = FALSE,
           !.copyReady = FALSE,
           !.subnamesSupported = FALSE,
           !.recreationCurrent = FALSE,
           !.promptCount = 0,
           !.lifecycle = "blocked"]
         ELSE [state EXCEPT
           !.phase = 99,
           !.sourceFresh = FALSE,
           !.copyReady = FALSE,
           !.subnamesSupported = FALSE,
           !.recreationCurrent = FALSE,
           !.promptCount = 1])

B2AuthorityChanges ==
  /\ scenario = "B2"
  /\ state.phase = 0
  /\ SetState(
       IF GuardEnabled("CurrentAuthorityOnly")
         THEN [state EXCEPT
           !.phase = 99,
           !.currentAuthority = "current-manager",
           !.restoredAuthority = "current-manager",
           !.managerOptIn = FALSE]
         ELSE [state EXCEPT
           !.phase = 99,
           !.currentAuthority = "current-manager",
           !.restoredAuthority = "old-manager",
           !.managerOptIn = FALSE])

B3LiveSubregistry ==
  /\ scenario = "B3"
  /\ state.phase = 0
  /\ SetState(
       IF GuardEnabled("LiveSubregistryGuard")
         THEN [state EXCEPT
           !.phase = 99,
           !.liveSubregistry = TRUE,
           !.subregistryPreserved = TRUE,
           !.lifecycle = "blocked"]
         ELSE [state EXCEPT
           !.phase = 99,
           !.liveSubregistry = TRUE,
           !.subregistryPreserved = FALSE,
           !.completionClaimed = TRUE])

B4LockedResolver ==
  /\ scenario = "B4"
  /\ state.phase = 0
  /\ SetState(
       IF GuardEnabled("LockedResolverControl")
         THEN [state EXCEPT
           !.phase = 99,
           !.lockedResolverCertified = FALSE,
           !.recordControl = TRUE,
           !.completionClaimed = FALSE,
           !.lifecycle = "blocked"]
         ELSE [state EXCEPT
           !.phase = 99,
           !.lockedResolverCertified = FALSE,
           !.recordControl = FALSE,
           !.completionClaimed = TRUE])

B5VerifyRoles ==
  /\ scenario = "B5"
  /\ state.phase = 0
  /\ SetState(
       IF GuardEnabled("ExactRoleVerification")
         THEN [state EXCEPT
           !.phase = 99,
           !.plannedRoles = {"owner", "wrapper-root"},
           !.actualRoles = {"owner", "wrapper-root"},
           !.completionClaimed = TRUE]
         ELSE [state EXCEPT
           !.phase = 99,
           !.plannedRoles = {"owner", "wrapper-root"},
           !.actualRoles = {"owner", "wrapper-root", "extra"},
           !.completionClaimed = TRUE])

B6TraverseRegistry ==
  /\ scenario = "B6"
  /\ state.phase = 0
  /\ SetState(
       IF GuardEnabled("CertifiedRegistryTraversal")
         THEN [state EXCEPT
           !.phase = 99,
           !.registryPathCertified = TRUE,
           !.verifiedAtReceipt = TRUE]
         ELSE [state EXCEPT
           !.phase = 99,
           !.registryPathCertified = FALSE,
           !.verifiedAtReceipt = TRUE])

C1ConfirmName ==
  /\ scenario = "C1"
  /\ state.phase = 0
  /\ SetState(
       IF GuardEnabled("ReceiptAndPostStateProof")
         THEN [state EXCEPT
           !.phase = 99,
           !.receiptSuccessful = TRUE,
           !.verifiedAtReceipt = FALSE,
           !.completionClaimed = FALSE,
           !.lifecycle = "failure"]
         ELSE [state EXCEPT
           !.phase = 99,
           !.receiptSuccessful = TRUE,
           !.verifiedAtReceipt = FALSE,
           !.completionClaimed = TRUE,
           !.completedNames = {Root}])

C2CrashAfterReceipt ==
  /\ scenario = "C2"
  /\ state.phase = 0
  /\ SetState(
       IF GuardEnabled("CheckpointBeforeJournalDelete")
         THEN [state EXCEPT
           !.phase = 99,
           !.receiptSuccessful = TRUE,
           !.verifiedAtReceipt = TRUE,
           !.submissions = {},
           !.checkpointNames = {Root},
           !.recoveryNames = {Child},
           !.completedNames = {Root},
           !.remainingNames = {Child}]
         ELSE [state EXCEPT
           !.phase = 99,
           !.receiptSuccessful = TRUE,
           !.verifiedAtReceipt = TRUE,
           !.submissions = {},
           !.checkpointNames = {},
           !.recoveryNames = {},
           !.completedNames = {},
           !.remainingNames = {Child}])

C3OperationIdentity ==
  /\ scenario = "C3"
  /\ state.phase = 0
  /\ SetState(
       IF GuardEnabled("ImmutableOperationIdentity")
         THEN [state EXCEPT
           !.phase = 99,
           !.plannedAction = "migrate",
           !.actualAction = "migrate"]
         ELSE [state EXCEPT
           !.phase = 99,
           !.plannedAction = "migrate",
           !.actualAction = "copy",
           !.completionClaimed = TRUE])

C4ClaimDashboardComplete ==
  /\ scenario = "C4"
  /\ state.phase = 0
  /\ SetState(
       IF GuardEnabled("CompleteWorkAccounting")
         THEN [state EXCEPT
           !.phase = 99,
           !.completedWork = Work,
           !.remainingWork = {},
           !.graceDone = TRUE,
           !.wrapperSyncDone = TRUE,
           !.cleanupDone = TRUE,
           !.completionClaimed = TRUE]
         ELSE [state EXCEPT
           !.phase = 99,
           !.completedWork = {"migration"},
           !.remainingWork = {"grace", "wrapper", "cleanup"},
           !.graceDone = FALSE,
           !.wrapperSyncDone = FALSE,
           !.cleanupDone = FALSE,
           !.completionClaimed = TRUE])

C5ReportPartial ==
  /\ scenario = "C5"
  /\ state.phase = 0
  /\ SetState(
       IF GuardEnabled("TruthfulOutcomeAndRefresh")
         THEN [state EXCEPT
           !.phase = 99,
           !.completedNames = {Root},
           !.remainingNames = {Child},
           !.outcome = "partial",
           !.cacheFresh = TRUE]
         ELSE [state EXCEPT
           !.phase = 99,
           !.completedNames = {Root},
           !.remainingNames = {Child},
           !.outcome = "failure",
           !.cacheFresh = FALSE])

C6HistoricalEvidence ==
  /\ scenario = "C6"
  /\ state.phase = 0
  /\ SetState(
       IF GuardEnabled("HistoricalNoResubmit")
         THEN [state EXCEPT
           !.phase = 99,
           !.historicalEvidence = TRUE,
           !.promptCount = 0,
           !.outcome = "blocked",
           !.evidencePreserved = TRUE]
         ELSE [state EXCEPT
           !.phase = 99,
           !.historicalEvidence = TRUE,
           !.promptCount = 1,
           !.evidencePreserved = FALSE])

D1RehydrateRetry ==
  /\ scenario = "D1"
  /\ state.phase = 0
  /\ SetState(
       IF GuardEnabled("SemanticRetryIdentity")
         THEN [state EXCEPT
           !.phase = 99,
           !.planWork = {"migration", "wrapper"},
           !.completedWork = {"migration"},
           !.remainingWork = {"wrapper"}]
         ELSE [state EXCEPT
           !.phase = 99,
           !.planWork = {"migration", "wrapper"},
           !.completedWork = {"migration"},
           !.remainingWork = {}])

D2StaleCleanup ==
  /\ scenario = "D2"
  /\ state.phase = 0
  /\ SetState(
       IF GuardEnabled("SnapshotCleanupCompare")
         THEN [state EXCEPT
           !.phase = 99,
           !.intents = {Root},
           !.recoveryNames = Names,
           !.evidencePreserved = TRUE]
         ELSE [state EXCEPT
           !.phase = 99,
           !.intents = {Root},
           !.recoveryNames = {},
           !.evidencePreserved = FALSE])

D3ConcurrentWrites ==
  /\ scenario = "D3"
  /\ state.phase = 0
  /\ SetState(
       IF GuardEnabled("JournalAtomicWrite")
         THEN [state EXCEPT
           !.phase = 99,
           !.intents = Names,
           !.recoveryNames = Names]
         ELSE [state EXCEPT
           !.phase = 99,
           !.intents = {Child},
           !.recoveryNames = {Child}])

D4CleanupOnly ==
  /\ scenario = "D4"
  /\ state.phase = 0
  /\ SetState(
       IF GuardEnabled("CleanupOnlyRunnable")
         THEN [state EXCEPT
           !.phase = 99,
           !.remainingNames = {},
           !.cleanupRequired = FALSE,
           !.cleanupDone = TRUE,
           !.lifecycle = "success"]
         ELSE [state EXCEPT
           !.phase = 99,
           !.remainingNames = {},
           !.cleanupRequired = TRUE,
           !.cleanupDone = FALSE,
           !.lifecycle = "idle"])

D5UncertainRead ==
  /\ scenario = "D5"
  /\ state.phase = 0
  /\ SetState(
       IF GuardEnabled("UncertaintyRetainsEvidence")
         THEN [state EXCEPT
           !.phase = 99,
           !.receiptOutcome = "unavailable",
           !.submissions = {Root},
           !.recoveryNames = Names,
           !.blockedNames = {Root},
           !.promptCount = 0,
           !.lifecycle = "blocked"]
         ELSE [state EXCEPT
           !.phase = 99,
           !.receiptOutcome = "unavailable",
           !.submissions = {},
           !.recoveryNames = {},
           !.blockedNames = {},
           !.promptCount = 1])

E1SubmitTree ==
  /\ scenario = "E1"
  /\ state.phase = 0
  /\ SetState(
       IF GuardEnabled("AtomicNameTree")
         THEN [state EXCEPT
           !.phase = 99,
           !.treeSubmittedParts = 0,
           !.outcome = "blocked"]
         ELSE [state EXCEPT
           !.phase = 99,
           !.treeSubmittedParts = 2,
           !.outcome = "partial"])

E2RetryReplay ==
  /\ scenario = "E2"
  /\ state.phase = 0
  /\ SetState(
       IF GuardEnabled("ReplayDeduplication")
         THEN [state EXCEPT !.phase = 99, !.replayCount = 1]
         ELSE [state EXCEPT !.phase = 99, !.replayCount = 2])

E3ClassifyAll ==
  /\ scenario = "E3"
  /\ state.phase = 0
  /\ SetState(
       IF GuardEnabled("TotalClassification")
         THEN [state EXCEPT
           !.phase = 99,
           !.inputNames = Names,
           !.classifiedNames = {Root},
           !.ineligibleNames = {Child}]
         ELSE [state EXCEPT
           !.phase = 99,
           !.inputNames = Names,
           !.classifiedNames = {Root},
           !.ineligibleNames = {},
           !.skippedNames = {}])

E4CopyRoute ==
  /\ scenario = "E4"
  /\ state.phase = 0
  /\ SetState(
       IF GuardEnabled("CopyRouteGuard")
         THEN [state EXCEPT
           !.phase = 99,
           !.copyRouteExists = FALSE,
           !.copied = FALSE,
           !.ineligibleNames = {Child}]
         ELSE [state EXCEPT
           !.phase = 99,
           !.copyRouteExists = FALSE,
           !.copied = TRUE])

E5DropUnknownLabels ==
  /\ scenario = "E5"
  /\ state.phase = 0
  /\ SetState(
       IF GuardEnabled("UnknownLabelConsentCap")
         THEN [state EXCEPT
           !.phase = 99,
           !.unknownDropCount = 0,
           !.unknownConsent = FALSE,
           !.outcome = "blocked"]
         ELSE [state EXCEPT
           !.phase = 99,
           !.unknownDropCount = 6,
           !.unknownConsent = FALSE,
           !.outcome = "success"])

E6ExpiryDecision ==
  /\ scenario = "E6"
  /\ state.phase = 0
  /\ SetState(
       IF GuardEnabled("ChainTimeExpiry")
         THEN [state EXCEPT
           !.phase = 99,
           !.expiredOnChain = TRUE,
           !.expiryFromChain = TRUE,
           !.promptCount = 0,
           !.outcome = "blocked"]
         ELSE [state EXCEPT
           !.phase = 99,
           !.expiredOnChain = TRUE,
           !.expiryFromChain = FALSE,
           !.promptCount = 1,
           !.outcome = "failure"])

F1StartRenewal ==
  /\ scenario = "F1"
  /\ state.phase = 0
  /\ SetState(
       IF GuardEnabled("RenewalFundingAndLock")
         THEN [state EXCEPT
           !.phase = 99,
           !.balanceSufficient = FALSE,
           !.otherRenewalActive = TRUE,
           !.renewalCount = 0,
           !.outcome = "blocked"]
         ELSE [state EXCEPT
           !.phase = 99,
           !.balanceSufficient = FALSE,
           !.otherRenewalActive = TRUE,
           !.renewalCount = 2])

G1RouteFailure ==
  /\ scenario = "G1"
  /\ state.phase = 0
  /\ SetState(
       IF GuardEnabled("FailureRouting")
         THEN [state EXCEPT
           !.phase = 99,
           !.lifecycle = "failure",
           !.runSettled = TRUE]
         ELSE [state EXCEPT
           !.phase = 99,
           !.lifecycle = "running",
           !.runSettled = FALSE])

G2ResolvePending ==
  /\ scenario = "G2"
  /\ state.phase = 0
  /\ SetState(
       IF GuardEnabled("FairPendingResolution")
         THEN [state EXCEPT
           !.phase = 99,
           !.receiptOutcome = "absent",
           !.unresolvedNames = {},
           !.blockedNames = {},
           !.retryOffered = TRUE,
           !.runSettled = TRUE]
         ELSE [state EXCEPT
           !.phase = 99,
           !.receiptOutcome = "unavailable",
           !.unresolvedNames = {Root},
           !.blockedNames = {Root},
           !.retryOffered = FALSE,
           !.runSettled = FALSE])

G3DeterministicFailure ==
  /\ scenario = "G3"
  /\ state.phase = 0
  /\ SetState(
       IF GuardEnabled("RetryEligibility")
         THEN [state EXCEPT
           !.phase = 99,
           !.deterministicFailure = TRUE,
           !.retryOffered = FALSE]
         ELSE [state EXCEPT
           !.phase = 99,
           !.deterministicFailure = TRUE,
           !.retryOffered = TRUE])

G4FinishProgress ==
  /\ scenario = "G4"
  /\ state.phase = 0
  /\ SetState(
       IF GuardEnabled("DynamicProgressAccounting")
         THEN [state EXCEPT
           !.phase = 99,
           !.actualPrompts = 2,
           !.progressTotal = 2,
           !.progressCurrent = 2,
           !.runSettled = TRUE]
         ELSE [state EXCEPT
           !.phase = 99,
           !.actualPrompts = 2,
           !.progressTotal = 1,
           !.progressCurrent = 1,
           !.runSettled = TRUE])

G5Recover ==
  /\ scenario = "G5"
  /\ state.phase = 0
  /\ SetState(
       IF GuardEnabled("Recoverability")
         THEN [state EXCEPT
           !.phase = 99,
           !.lifecycle = "blocked",
           !.intents = {Root},
           !.recoveryNames = Names,
           !.evidencePreserved = TRUE,
           !.runSettled = TRUE]
         ELSE [state EXCEPT
           !.phase = 99,
           !.lifecycle = "running",
           !.intents = {Root},
           !.recoveryNames = {},
           !.evidencePreserved = FALSE,
           !.runSettled = FALSE])

CoreStart ==
  /\ scenario = "CORE"
  /\ state.phase = 0
  /\ SetState([state EXCEPT !.phase = 1, !.lifecycle = "running"])

CorePersistRoot ==
  /\ scenario = "CORE"
  /\ state.phase = 1
  /\ SetState([state EXCEPT
       !.phase = 2,
       !.intents = {Root},
       !.recoveryNames = Names])

CorePromptRoot ==
  /\ scenario = "CORE"
  /\ state.phase = 2
  /\ SetState([state EXCEPT
       !.phase = 3,
       !.promptingTabs = {"tab-1"},
       !.promptCount = 1])

CoreRecordRoot ==
  /\ scenario = "CORE"
  /\ state.phase = 3
  /\ SetState([state EXCEPT
       !.phase = 4,
       !.promptingTabs = {},
       !.intents = {},
       !.submissions = {Root},
       !.hashKnown = TRUE])

CoreBlockRoot ==
  /\ scenario = "CORE"
  /\ state.phase = 4
  /\ SetState([state EXCEPT
       !.phase = 5,
       !.lifecycle = "blocked",
       !.receiptOutcome = "unavailable",
       !.unresolvedNames = {Root},
       !.blockedNames = {Root}])

CoreResolveRoot ==
  /\ scenario = "CORE"
  /\ state.phase = 5
  /\ SetState([state EXCEPT
       !.phase = 6,
       !.lifecycle = "running",
       !.receiptOutcome = "success",
       !.unresolvedNames = {},
       !.blockedNames = {},
       !.receiptSuccessful = TRUE])

CoreVerifyRoot ==
  /\ scenario = "CORE"
  /\ state.phase = 6
  /\ SetState([state EXCEPT
       !.phase = 7,
       !.verifiedNames = {Root},
       !.completedNames = {Root},
       !.remainingNames = {Child},
       !.verifiedAtReceipt = TRUE])

CoreCheckpointRoot ==
  /\ scenario = "CORE"
  /\ state.phase = 7
  /\ SetState([state EXCEPT
       !.phase = 8,
       !.checkpointNames = {Root},
       !.submissions = {},
       !.recoveryNames = {Child}])

CorePersistChild ==
  /\ scenario = "CORE"
  /\ state.phase = 8
  /\ SetState([state EXCEPT
       !.phase = 9,
       !.intents = {Child},
       !.recoveryNames = {Child}])

CorePromptChild ==
  /\ scenario = "CORE"
  /\ state.phase = 9
  /\ SetState([state EXCEPT
       !.phase = 10,
       !.promptingTabs = {"tab-1"},
       !.promptCount = 2])

CoreRecordChild ==
  /\ scenario = "CORE"
  /\ state.phase = 10
  /\ SetState([state EXCEPT
       !.phase = 11,
       !.promptingTabs = {},
       !.intents = {},
       !.submissions = {Child}])

CoreVerifyChild ==
  /\ scenario = "CORE"
  /\ state.phase = 11
  /\ SetState([state EXCEPT
       !.phase = 12,
       !.verifiedNames = Names,
       !.completedNames = Names,
       !.remainingNames = {},
       !.receiptSuccessful = TRUE,
       !.verifiedAtReceipt = TRUE])

CoreCheckpointChild ==
  /\ scenario = "CORE"
  /\ state.phase = 12
  /\ SetState([state EXCEPT
       !.phase = 13,
       !.checkpointNames = Names,
       !.submissions = {},
       !.recoveryNames = {}])

CoreComplete ==
  /\ scenario = "CORE"
  /\ state.phase = 13
  /\ SetState([state EXCEPT
       !.phase = 99,
       !.lifecycle = "success",
       !.completionClaimed = TRUE,
       !.completedWork = Work,
       !.remainingWork = {},
       !.graceDone = TRUE,
       !.wrapperSyncDone = TRUE,
       !.cleanupDone = TRUE,
       !.runSettled = TRUE])

Done ==
  /\ state.phase = 99
  /\ UNCHANGED vars

Next ==
  \/ A1FirstPrompt \/ A1SecondPrompt
  \/ A2Prompt \/ A2CancelAndContinue
  \/ A3OpenPrompt \/ A4RecordHash \/ A5MissingReceipt
  \/ A6RevertedAttempt \/ A7RejectWithoutHash \/ A8RejectAfterGrant
  \/ B1SourceChanges \/ B2AuthorityChanges \/ B3LiveSubregistry
  \/ B4LockedResolver \/ B5VerifyRoles \/ B6TraverseRegistry
  \/ C1ConfirmName \/ C2CrashAfterReceipt \/ C3OperationIdentity
  \/ C4ClaimDashboardComplete \/ C5ReportPartial \/ C6HistoricalEvidence
  \/ D1RehydrateRetry \/ D2StaleCleanup \/ D3ConcurrentWrites
  \/ D4CleanupOnly \/ D5UncertainRead
  \/ E1SubmitTree \/ E2RetryReplay \/ E3ClassifyAll
  \/ E4CopyRoute \/ E5DropUnknownLabels \/ E6ExpiryDecision
  \/ F1StartRenewal \/ G1RouteFailure \/ G2ResolvePending
  \/ G3DeterministicFailure \/ G4FinishProgress \/ G5Recover
  \/ CoreStart \/ CorePersistRoot \/ CorePromptRoot \/ CoreRecordRoot
  \/ CoreBlockRoot \/ CoreResolveRoot \/ CoreVerifyRoot
  \/ CoreCheckpointRoot \/ CorePersistChild \/ CorePromptChild
  \/ CoreRecordChild \/ CoreVerifyChild \/ CoreCheckpointChild
  \/ CoreComplete \/ Done

Spec ==
  /\ Init
  /\ [][Next]_vars
  /\ (scenario = "CORE" => WF_vars(CoreResolveRoot))

TypeOK ==
  /\ scenario \in EnabledScenarios
  /\ state.phase \in 0..99
  /\ state.lifecycle \in Lifecycle
  /\ state.promptingTabs \subseteq Tabs
  /\ state.promptCount \in 0..2
  /\ state.promptCountAtCancel \in 0..2
  /\ state.cancelled \in BOOLEAN
  /\ state.intents \subseteq Names
  /\ state.submissions \subseteq Names
  /\ state.recoveryNames \subseteq Names
  /\ state.checkpointNames \subseteq Names
  /\ state.remainingNames \subseteq Names
  /\ state.completedNames \subseteq Names
  /\ state.verifiedNames \subseteq Names
  /\ state.unresolvedNames \subseteq Names
  /\ state.blockedNames \subseteq Names
  /\ state.temporaryGrantLive \in BOOLEAN
  /\ state.cleanupRequired \in BOOLEAN
  /\ state.completionClaimed \in BOOLEAN
  /\ state.previewApprovals \subseteq Approvals
  /\ state.actualApprovals \subseteq Approvals
  /\ state.sourceOwned \in BOOLEAN
  /\ state.retried \in BOOLEAN
  /\ state.userRejected \in BOOLEAN
  /\ state.hashKnown \in BOOLEAN
  /\ state.receiptOutcome \in ReceiptOutcomes
  /\ state.evidencePreserved \in BOOLEAN
  /\ state.plannedAction \in Actions
  /\ state.actualAction \in Actions
  /\ state.sourceFresh \in BOOLEAN
  /\ state.copyReady \in BOOLEAN
  /\ state.subnamesSupported \in BOOLEAN
  /\ state.recreationCurrent \in BOOLEAN
  /\ state.currentAuthority \in Authorities
  /\ state.restoredAuthority \in Authorities
  /\ state.managerOptIn \in BOOLEAN
  /\ state.liveSubregistry \in BOOLEAN
  /\ state.subregistryPreserved \in BOOLEAN
  /\ state.lockedResolverCertified \in BOOLEAN
  /\ state.recordControl \in BOOLEAN
  /\ state.plannedRoles \subseteq Roles
  /\ state.actualRoles \subseteq Roles
  /\ state.registryPathCertified \in BOOLEAN
  /\ state.receiptSuccessful \in BOOLEAN
  /\ state.verifiedAtReceipt \in BOOLEAN
  /\ state.graceDone \in BOOLEAN
  /\ state.wrapperSyncDone \in BOOLEAN
  /\ state.cleanupDone \in BOOLEAN
  /\ state.outcome \in Outcomes
  /\ state.cacheFresh \in BOOLEAN
  /\ state.historicalEvidence \in BOOLEAN
  /\ state.planWork \subseteq Work
  /\ state.remainingWork \subseteq Work
  /\ state.completedWork \subseteq Work
  /\ state.treeSubmittedParts \in 0..2
  /\ state.replayCount \in 0..2
  /\ state.inputNames \subseteq Names
  /\ state.classifiedNames \subseteq Names
  /\ state.ineligibleNames \subseteq Names
  /\ state.skippedNames \subseteq Names
  /\ state.copyRouteExists \in BOOLEAN
  /\ state.copied \in BOOLEAN
  /\ state.unknownDropCount \in 0..6
  /\ state.unknownConsent \in BOOLEAN
  /\ state.expiryFromChain \in BOOLEAN
  /\ state.expiredOnChain \in BOOLEAN
  /\ state.renewalCount \in 0..2
  /\ state.balanceSufficient \in BOOLEAN
  /\ state.otherRenewalActive \in BOOLEAN
  /\ state.retryOffered \in BOOLEAN
  /\ state.deterministicFailure \in BOOLEAN
  /\ state.progressCurrent \in 0..2
  /\ state.progressTotal \in 0..2
  /\ state.actualPrompts \in 0..2
  /\ state.runSettled \in BOOLEAN

A1_OneExecutionPerScope ==
  scenario = "A1" => Cardinality(state.promptingTabs) <= 1

A2_NoPromptAfterCancel ==
  scenario = "A2" /\ state.cancelled =>
    state.promptCount <= state.promptCountAtCancel

A3_IntentBeforePrompt ==
  scenario = "A3" /\ state.promptCount > 0 =>
    /\ state.intents # {}
    /\ state.intents \subseteq state.recoveryNames

A4_HashReplacesIntent ==
  scenario = "A4" /\ state.hashKnown =>
    /\ state.submissions # {}
    /\ state.intents = {}

A5_PendingAttemptNeverReprompts ==
  scenario = "A5" /\ state.receiptOutcome = "unavailable" =>
    /\ state.submissions # {}
    /\ state.blockedNames # {}
    /\ state.promptCount <= 1

A6_RevertRetryRequiresSourceOwnership ==
  scenario = "A6" /\ state.retried => state.sourceOwned

A7_RejectionDropsOnlyIntent ==
  scenario = "A7" /\ state.userRejected /\ ~state.hashKnown =>
    /\ state.intents = {}
    /\ state.evidencePreserved
    /\ state.recoveryNames # {}

A8_ApprovalsMatchPreviewAndAreCleaned ==
  scenario = "A8" =>
    /\ state.actualApprovals = state.previewApprovals
    /\ (~state.userRejected \/ ~state.temporaryGrantLive)
    /\ (~state.cleanupRequired \/ state.cleanupDone)

B1_BatchUsesFreshSource ==
  scenario = "B1" /\ state.promptCount > 0 =>
    /\ state.sourceFresh
    /\ state.copyReady
    /\ state.subnamesSupported
    /\ state.recreationCurrent

B2_NoStaleAuthorityRestored ==
  scenario = "B2" =>
    /\ state.restoredAuthority = state.currentAuthority
    /\ (state.managerOptIn \/ state.restoredAuthority # "old-manager")

B3_LiveSubregistryIsPreserved ==
  scenario = "B3" /\ state.liveSubregistry => state.subregistryPreserved

B4_LockedNameKeepsRecordControl ==
  scenario = "B4" /\ state.completionClaimed =>
    state.lockedResolverCertified \/ state.recordControl

B5_ExactlyPlannedRoles ==
  scenario = "B5" /\ state.completionClaimed =>
    state.actualRoles = state.plannedRoles

B6_VerificationUsesCertifiedRegistryPath ==
  scenario = "B6" /\ state.verifiedAtReceipt => state.registryPathCertified

C1_CompletionRequiresReceiptProof ==
  scenario = "C1" /\ state.completionClaimed =>
    state.receiptSuccessful /\ state.verifiedAtReceipt

C2_EvidenceDeletedOnlyAfterCheckpoint ==
  scenario = "C2" /\ state.phase = 99 /\ state.submissions = {} =>
    /\ state.checkpointNames = state.completedNames
    /\ state.recoveryNames = state.remainingNames

C3_NameActionIsImmutable ==
  scenario = "C3" => state.actualAction = state.plannedAction

C4_CompleteMeansAllRequiredWorkDone ==
  scenario = "C4" /\ state.completionClaimed =>
    /\ state.completedWork = state.planWork
    /\ state.remainingWork = {}
    /\ state.graceDone
    /\ state.wrapperSyncDone
    /\ state.cleanupDone

C5_OutcomeAndViewsAreTruthful ==
  scenario = "C5" =>
    /\ (state.completedNames # {} /\ state.remainingNames # {} => state.outcome = "partial")
    /\ state.cacheFresh

C6_HistoricalEvidenceNeverResubmits ==
  scenario = "C6" /\ state.historicalEvidence =>
    state.promptCount = 0 /\ state.evidencePreserved

D1_RetryKeepsExactlyRemainingWork ==
  scenario = "D1" =>
    /\ state.completedWork \cup state.remainingWork = state.planWork
    /\ state.completedWork \cap state.remainingWork = {}

D2_AttemptNeverLosesRecovery ==
  scenario = "D2" /\ state.intents # {} =>
    state.intents \subseteq state.recoveryNames

D3_ConcurrentJournalWritesDoNotLoseUpdates ==
  scenario = "D3" /\ state.phase = 99 => state.intents = Names

D4_CleanupOnlyRecoveryCanFinish ==
  scenario = "D4" /\ state.phase = 99 =>
    state.cleanupDone /\ state.lifecycle = "success"

D5_UncertaintyKeepsEvidenceAndBlocksPrompt ==
  scenario = "D5" /\ state.receiptOutcome = "unavailable" =>
    /\ state.submissions # {}
    /\ state.recoveryNames # {}
    /\ state.blockedNames # {}
    /\ state.promptCount = 0

E1_NameAndTreeAreAtomic ==
  scenario = "E1" => state.treeSubmittedParts \in {0, 1}

E2_RecordReplayRunsAtMostOnce ==
  scenario = "E2" => state.replayCount <= 1

E3_EveryNameHasOneBucket ==
  scenario = "E3" /\ state.phase = 99 =>
    /\ state.classifiedNames \cap state.ineligibleNames = {}
    /\ state.classifiedNames \cap state.skippedNames = {}
    /\ state.ineligibleNames \cap state.skippedNames = {}
    /\ state.classifiedNames \cup state.ineligibleNames \cup state.skippedNames = state.inputNames

E4_CopyRequiresRoute ==
  scenario = "E4" /\ state.copied => state.copyRouteExists

E5_UnknownLabelsNeedConsentAndCap ==
  scenario = "E5" /\ state.unknownDropCount > 0 =>
    state.unknownConsent /\ state.unknownDropCount <= 5

E6_ExpiryUsesChainTimeOrFailsClosed ==
  scenario = "E6" /\ state.expiredOnChain =>
    state.expiryFromChain /\ state.promptCount = 0

F1_RenewalIsFundedAndSingle ==
  scenario = "F1" /\ state.renewalCount > 0 =>
    state.balanceSufficient /\ ~state.otherRenewalActive /\ state.renewalCount = 1

G1_RunTerminatesUnderFairResponses ==
  scenario = "G1" /\ state.phase = 99 =>
    state.runSettled /\ state.lifecycle \in {"success", "failure", "blocked"}

G2_PendingAttemptEventuallyResolves ==
  scenario = "G2" /\ state.phase = 99 =>
    state.runSettled /\ state.unresolvedNames = {} /\ state.retryOffered

G3_RetryOfferedOnlyWhenUseful ==
  scenario = "G3" /\ state.deterministicFailure => ~state.retryOffered

G4_ProgressMatchesEveryPrompt ==
  scenario = "G4" /\ state.runSettled =>
    state.progressCurrent = state.progressTotal /\ state.progressTotal = state.actualPrompts

G5_RecoveryNeverSilentlyDisappears ==
  scenario = "G5" /\ state.phase = 99 =>
    /\ state.runSettled
    /\ state.lifecycle \in {"success", "failure", "blocked"}
    /\ (state.intents = {} \/ state.intents \subseteq state.recoveryNames)
    /\ state.evidencePreserved

ContractState == [
  lifecycle |-> state.lifecycle,
  promptingTabs |-> state.promptingTabs,
  cancelled |-> state.cancelled,
  intents |-> state.intents,
  submissions |-> state.submissions,
  recoveryNames |-> state.recoveryNames,
  checkpointNames |-> state.checkpointNames,
  remainingNames |-> state.remainingNames,
  completedNames |-> state.completedNames,
  verifiedNames |-> state.verifiedNames,
  unresolvedNames |-> state.unresolvedNames,
  temporaryGrantLive |-> state.temporaryGrantLive,
  cleanupRequired |-> state.cleanupRequired,
  completionClaimed |-> state.completionClaimed
]

Contract == INSTANCE MigrationContract WITH
  Tabs <- Tabs,
  Names <- Names,
  HonestJournal <- TRUE,
  HonestChain <- TRUE,
  HonestWallet <- TRUE,
  FairResponses <- TRUE,
  contractState <- ContractState

ContractRefinement == Contract!Spec
ContractAssumptions == Contract!EnvironmentAssumptions
ContractGuarantees == Contract!Guarantees

=============================================================================
