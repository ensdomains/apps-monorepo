------------------------ MODULE MigrationContract ------------------------
EXTENDS FiniteSets, Naturals

CONSTANTS Tabs, Names, HonestJournal, HonestChain, HonestWallet, FairResponses

ASSUME /\ Tabs # {}
       /\ Names # {}
       /\ HonestJournal \in BOOLEAN
       /\ HonestChain \in BOOLEAN
       /\ HonestWallet \in BOOLEAN
       /\ FairResponses \in BOOLEAN

VARIABLE contractState

ContractVars == <<contractState>>

Lifecycle == {"idle", "running", "blocked", "success", "failure"}

TypeOK ==
  /\ contractState.lifecycle \in Lifecycle
  /\ contractState.promptingTabs \subseteq Tabs
  /\ contractState.cancelled \in BOOLEAN
  /\ contractState.intents \subseteq Names
  /\ contractState.submissions \subseteq Names
  /\ contractState.recoveryNames \subseteq Names
  /\ contractState.checkpointNames \subseteq Names
  /\ contractState.remainingNames \subseteq Names
  /\ contractState.completedNames \subseteq Names
  /\ contractState.verifiedNames \subseteq Names
  /\ contractState.unresolvedNames \subseteq Names
  /\ contractState.temporaryGrantLive \in BOOLEAN
  /\ contractState.cleanupRequired \in BOOLEAN
  /\ contractState.completionClaimed \in BOOLEAN

EnvironmentAssumptions ==
  /\ HonestJournal
  /\ HonestChain
  /\ HonestWallet
  /\ FairResponses
  /\ TypeOK

Init ==
  /\ contractState.lifecycle = "idle"
  /\ contractState.promptingTabs = {}
  /\ ~contractState.cancelled
  /\ contractState.intents = {}
  /\ contractState.submissions = {}
  /\ contractState.recoveryNames = {}
  /\ contractState.checkpointNames = {}
  /\ contractState.remainingNames = Names
  /\ contractState.completedNames = {}
  /\ contractState.verifiedNames = {}
  /\ contractState.unresolvedNames = {}
  /\ ~contractState.temporaryGrantLive
  /\ ~contractState.cleanupRequired
  /\ ~contractState.completionClaimed

Start ==
  /\ contractState.lifecycle = "idle"
  /\ contractState' = [contractState EXCEPT !.lifecycle = "running"]

PersistIntent(names) ==
  /\ contractState.lifecycle = "running"
  /\ names \subseteq contractState.remainingNames
  /\ names # {}
  /\ contractState' = [contractState EXCEPT
       !.intents = @ \cup names,
       !.recoveryNames = contractState.remainingNames]

Prompt(tab, names) ==
  /\ contractState.lifecycle = "running"
  /\ ~contractState.cancelled
  /\ names \subseteq contractState.intents
  /\ names \subseteq contractState.recoveryNames
  /\ tab \in Tabs
  /\ Cardinality(contractState.promptingTabs) = 0
  /\ contractState' = [contractState EXCEPT !.promptingTabs = {tab}]

RecordHash(names) ==
  /\ names \subseteq contractState.intents
  /\ contractState' = [contractState EXCEPT
       !.submissions = @ \cup names,
       !.intents = @ \ names,
       !.promptingTabs = {}]

BlockPending(names) ==
  /\ names \subseteq contractState.submissions
  /\ contractState' = [contractState EXCEPT
       !.lifecycle = "blocked",
       !.unresolvedNames = @ \cup names]

ResolvePending(names) ==
  /\ contractState.lifecycle = "blocked"
  /\ names \subseteq contractState.unresolvedNames
  /\ contractState' = [contractState EXCEPT
       !.lifecycle = "running",
       !.unresolvedNames = @ \ names]

Verify(names) ==
  /\ contractState.lifecycle = "running"
  /\ names \subseteq contractState.submissions
  /\ contractState' = [contractState EXCEPT
       !.verifiedNames = @ \cup names,
       !.completedNames = @ \cup names,
       !.remainingNames = @ \ names]

Checkpoint(names) ==
  /\ names \subseteq contractState.verifiedNames
  /\ contractState' = [contractState EXCEPT
       !.checkpointNames = @ \cup names,
       !.submissions = @ \ names,
       !.recoveryNames = contractState.remainingNames]

Cancel ==
  /\ contractState.lifecycle \in {"running", "blocked"}
  /\ contractState' = [contractState EXCEPT
       !.cancelled = TRUE,
       !.promptingTabs = {},
       !.lifecycle = "failure"]

RequireCleanup ==
  /\ contractState' = [contractState EXCEPT
       !.temporaryGrantLive = TRUE,
       !.cleanupRequired = TRUE]

FinishCleanup ==
  /\ contractState.cleanupRequired
  /\ contractState' = [contractState EXCEPT
       !.temporaryGrantLive = FALSE,
       !.cleanupRequired = FALSE]

ClaimComplete ==
  /\ contractState.remainingNames = {}
  /\ contractState.completedNames = Names
  /\ contractState.verifiedNames = Names
  /\ contractState.submissions = {}
  /\ ~contractState.temporaryGrantLive
  /\ ~contractState.cleanupRequired
  /\ contractState' = [contractState EXCEPT
       !.completionClaimed = TRUE,
       !.lifecycle = "success"]

Done ==
  /\ contractState.lifecycle \in {"success", "failure"}
  /\ UNCHANGED contractState

Next ==
  \/ Start
  \/ \E names \in SUBSET Names: PersistIntent(names)
  \/ \E tab \in Tabs: \E names \in SUBSET Names: Prompt(tab, names)
  \/ \E names \in SUBSET Names: RecordHash(names)
  \/ \E names \in SUBSET Names: BlockPending(names)
  \/ \E names \in SUBSET Names: ResolvePending(names)
  \/ \E names \in SUBSET Names: Verify(names)
  \/ \E names \in SUBSET Names: Checkpoint(names)
  \/ Cancel
  \/ RequireCleanup
  \/ FinishCleanup
  \/ ClaimComplete
  \/ Done

Spec ==
  /\ Init
  /\ [][Next]_ContractVars
  /\ (FairResponses => WF_ContractVars(\E names \in SUBSET Names: ResolvePending(names)))

OnePromptPerScope == Cardinality(contractState.promptingTabs) <= 1

NoPromptAfterCancel == contractState.cancelled => contractState.promptingTabs = {}

EveryPromptHasDurableIntent ==
  contractState.promptingTabs # {} =>
    /\ contractState.intents # {}
    /\ contractState.intents \subseteq contractState.recoveryNames

PendingSubmissionStaysTracked ==
  contractState.unresolvedNames \subseteq contractState.submissions

CompletionHasVerifiedProof ==
  contractState.completionClaimed =>
    /\ contractState.completedNames = Names
    /\ contractState.verifiedNames = Names
    /\ contractState.checkpointNames = Names
    /\ contractState.remainingNames = {}
    /\ contractState.submissions = {}

NoTemporaryGrantAtCompletion ==
  contractState.completionClaimed =>
    /\ ~contractState.temporaryGrantLive
    /\ ~contractState.cleanupRequired

RecoveryCoversOutstandingWork ==
  contractState.intents \cup contractState.submissions \cup contractState.unresolvedNames
    \subseteq contractState.recoveryNames \cup contractState.checkpointNames

Guarantees ==
  /\ OnePromptPerScope
  /\ NoPromptAfterCancel
  /\ EveryPromptHasDurableIntent
  /\ PendingSubmissionStaysTracked
  /\ CompletionHasVerifiedProof
  /\ NoTemporaryGrantAtCompletion
  /\ RecoveryCoversOutstandingWork

=============================================================================
