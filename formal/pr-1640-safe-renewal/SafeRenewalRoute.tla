---- MODULE SafeRenewalRoute ----
EXTENDS TLC

CONSTANTS
  WaitForSafeDetection,
  SafeUsesWalletRoute,
  IntentUsesSessionGate,
  PreserveL2IntentFunding,
  WalletRouteUsesWalletConnectivity,
  HideSessionControlsUntilSafeResolved

SafeStates == {"pending", "not-safe", "safe"}
BaseSigners == {"none", "eoa", "hca"}
Routes == {"none", "wallet", "intent"}
RenewalFlows == {"single-v1", "single-v2", "bulk-v2"}
Phases == {"detecting", "resolved", "gating", "ready", "bridged", "done"}

BaseRoute(signer) ==
  IF signer = "hca" THEN "intent"
  ELSE IF signer = "eoa" THEN "wallet"
  ELSE "none"

VARIABLES
  phase,
  safeState,
  baseSigner,
  renewalFlow,
  walletClient,
  walletConnected,
  hcaConnected,
  l2Selected,
  route,
  canProceed,
  sessionControlsVisible,
  gatePassed,
  bridgeFunded,
  submitted

vars == <<
  phase,
  safeState,
  baseSigner,
  renewalFlow,
  walletClient,
  walletConnected,
  hcaConnected,
  l2Selected,
  route,
  canProceed,
  sessionControlsVisible,
  gatePassed,
  bridgeFunded,
  submitted
>>

Init ==
  /\ phase = "detecting"
  /\ safeState \in SafeStates
  /\ baseSigner \in BaseSigners
  /\ renewalFlow \in RenewalFlows
  /\ walletClient \in BOOLEAN
  /\ walletConnected \in BOOLEAN
  /\ hcaConnected \in BOOLEAN
  /\ l2Selected \in BOOLEAN
  /\ route = "none"
  /\ canProceed = FALSE
  /\ sessionControlsVisible =
       (hcaConnected /\ ~HideSessionControlsUntilSafeResolved)
  /\ gatePassed = FALSE
  /\ bridgeFunded = FALSE
  /\ submitted = FALSE

ResolvedRoute ==
  IF safeState = "pending" /\ WaitForSafeDetection
    THEN "none"
  ELSE IF safeState = "safe"
    THEN IF ~walletClient
           THEN "none"
           ELSE IF SafeUsesWalletRoute
                  THEN "wallet"
                  ELSE BaseRoute(baseSigner)
  ELSE BaseRoute(baseSigner)

ResolveRoute ==
  /\ phase = "detecting"
  /\ phase' = "resolved"
  /\ route' = ResolvedRoute
  /\ canProceed' =
       IF ResolvedRoute = "wallet"
         THEN IF WalletRouteUsesWalletConnectivity
                THEN walletConnected
                ELSE hcaConnected
       ELSE IF ResolvedRoute = "intent"
         THEN hcaConnected
         ELSE FALSE
  /\ sessionControlsVisible' =
       IF safeState = "pending"
         THEN hcaConnected /\ ~HideSessionControlsUntilSafeResolved
         ELSE safeState = "not-safe" /\ hcaConnected
  /\ UNCHANGED <<
       safeState,
       baseSigner,
       renewalFlow,
       walletClient,
       walletConnected,
       hcaConnected,
       l2Selected,
       gatePassed,
       bridgeFunded,
       submitted
     >>

RequiresSessionGate == route = "intent" /\ renewalFlow = "single-v2"

ChooseRoute ==
  /\ phase = "resolved"
  /\ route /= "none"
  /\ phase' =
       IF RequiresSessionGate /\ IntentUsesSessionGate
         THEN "gating"
         ELSE "ready"
  /\ UNCHANGED <<
       safeState,
       baseSigner,
       renewalFlow,
       walletClient,
       walletConnected,
       hcaConnected,
       l2Selected,
       route,
       canProceed,
       sessionControlsVisible,
       gatePassed,
       bridgeFunded,
       submitted
     >>

NoRoute ==
  /\ phase = "resolved"
  /\ route = "none"
  /\ phase' = "done"
  /\ UNCHANGED <<
       safeState,
       baseSigner,
       renewalFlow,
       walletClient,
       walletConnected,
       hcaConnected,
       l2Selected,
       route,
       canProceed,
       sessionControlsVisible,
       gatePassed,
       bridgeFunded,
       submitted
     >>

ApproveSession ==
  /\ phase = "gating"
  /\ phase' = "ready"
  /\ gatePassed' = TRUE
  /\ UNCHANGED <<
       safeState,
       baseSigner,
       renewalFlow,
       walletClient,
       walletConnected,
       hcaConnected,
       l2Selected,
       route,
       canProceed,
       sessionControlsVisible,
       bridgeFunded,
       submitted
     >>

BridgeL2 ==
  /\ phase = "ready"
  /\ route = "intent"
  /\ l2Selected
  /\ PreserveL2IntentFunding
  /\ phase' = "bridged"
  /\ bridgeFunded' = TRUE
  /\ UNCHANGED <<
       safeState,
       baseSigner,
       renewalFlow,
       walletClient,
       walletConnected,
       hcaConnected,
       l2Selected,
       route,
       canProceed,
       sessionControlsVisible,
       gatePassed,
       submitted
     >>

SubmitReady ==
  /\ phase = "ready"
  /\ canProceed
  /\ ~(route = "intent" /\ l2Selected /\ PreserveL2IntentFunding)
  /\ phase' = "done"
  /\ submitted' = TRUE
  /\ UNCHANGED <<
       safeState,
       baseSigner,
       renewalFlow,
       walletClient,
       walletConnected,
       hcaConnected,
       l2Selected,
       route,
       canProceed,
       sessionControlsVisible,
       gatePassed,
       bridgeFunded
     >>

SubmitBridged ==
  /\ phase = "bridged"
  /\ canProceed
  /\ phase' = "done"
  /\ submitted' = TRUE
  /\ UNCHANGED <<
       safeState,
       baseSigner,
       renewalFlow,
       walletClient,
       walletConnected,
       hcaConnected,
       l2Selected,
       route,
       canProceed,
       sessionControlsVisible,
       gatePassed,
       bridgeFunded
     >>

CannotProceed ==
  /\ phase \in {"ready", "bridged"}
  /\ ~canProceed
  /\ phase' = "done"
  /\ UNCHANGED <<
       safeState,
       baseSigner,
       renewalFlow,
       walletClient,
       walletConnected,
       hcaConnected,
       l2Selected,
       route,
       canProceed,
       sessionControlsVisible,
       gatePassed,
       bridgeFunded,
       submitted
     >>

Done ==
  /\ phase = "done"
  /\ UNCHANGED vars

Next ==
  \/ ResolveRoute
  \/ ChooseRoute
  \/ NoRoute
  \/ ApproveSession
  \/ BridgeL2
  \/ SubmitReady
  \/ SubmitBridged
  \/ CannotProceed
  \/ Done

Spec == Init /\ [][Next]_vars

TypeOK ==
  /\ phase \in Phases
  /\ safeState \in SafeStates
  /\ baseSigner \in BaseSigners
  /\ renewalFlow \in RenewalFlows
  /\ walletClient \in BOOLEAN
  /\ walletConnected \in BOOLEAN
  /\ hcaConnected \in BOOLEAN
  /\ l2Selected \in BOOLEAN
  /\ route \in Routes
  /\ canProceed \in BOOLEAN
  /\ sessionControlsVisible \in BOOLEAN
  /\ gatePassed \in BOOLEAN
  /\ bridgeFunded \in BOOLEAN
  /\ submitted \in BOOLEAN

PendingSafeCheckNeverSubmits == safeState = "pending" => ~submitted
PendingSafeCheckHidesSessionControls ==
  safeState = "pending" => ~sessionControlsVisible
SafeWithClientUsesWallet ==
  (safeState = "safe" /\ walletClient /\ phase /= "detecting")
    => route = "wallet"
SafeWithoutClientHasNoRoute ==
  (safeState = "safe" /\ ~walletClient /\ phase /= "detecting")
    => route = "none"
ConnectedSafeWalletCanProceed ==
  (safeState = "safe" /\ walletClient /\ walletConnected /\ phase /= "detecting")
    => canProceed
NonSafeHcaUsesIntent ==
  (safeState = "not-safe" /\ baseSigner = "hca" /\ phase /= "detecting")
    => route = "intent"
NonSafeEoaUsesWallet ==
  (safeState = "not-safe" /\ baseSigner = "eoa" /\ phase /= "detecting")
    => route = "wallet"
IntentSubmissionRequiresGate ==
  (submitted /\ RequiresSessionGate) => gatePassed
UngatedRenewalsNeverUseGate ==
  ~RequiresSessionGate => (~gatePassed /\ phase /= "gating")
L2IntentBridgesBeforeSubmission ==
  (submitted /\ route = "intent" /\ l2Selected) => bridgeFunded

====
