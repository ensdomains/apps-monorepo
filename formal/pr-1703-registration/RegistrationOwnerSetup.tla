---- MODULE RegistrationOwnerSetup ----
EXTENDS Integers, TLC

CONSTANTS
  ValidatePreApprovalQuote,
  ValidatePreparedRoute,
  RejectExtraAuthority,
  BindFeeToReviewedSetup,
  RecheckExactAllowance,
  RejectCanceledAttempt,
  PreserveRevealSession

FeeValues == {1, 2}
Phases == {
  "preflight",
  "awaiting-consent",
  "prepared",
  "setup-signed",
  "setup-submitted",
  "done"
}
Signers == {"none", "owner", "session"}

VARIABLES
  phase,
  preflightValid,
  consented,
  canceled,
  routeMatches,
  extraAuthority,
  allowanceExact,
  reviewedSetupFee,
  freshSetupFee,
  remainingBalance,
  revealReserve,
  setupSigner,
  revealSigner,
  setupSigned,
  setupSubmitted,
  revealSigned

vars == <<
  phase,
  preflightValid,
  consented,
  canceled,
  routeMatches,
  extraAuthority,
  allowanceExact,
  reviewedSetupFee,
  freshSetupFee,
  remainingBalance,
  revealReserve,
  setupSigner,
  revealSigner,
  setupSigned,
  setupSubmitted,
  revealSigned
>>

Init ==
  /\ phase = "preflight"
  /\ preflightValid = FALSE
  /\ consented = FALSE
  /\ canceled = FALSE
  /\ routeMatches = FALSE
  /\ extraAuthority = FALSE
  /\ allowanceExact = FALSE
  /\ reviewedSetupFee = 1
  /\ freshSetupFee = 1
  /\ remainingBalance = 2
  /\ revealReserve = 1
  /\ setupSigner = "none"
  /\ revealSigner = "none"
  /\ setupSigned = FALSE
  /\ setupSubmitted = FALSE
  /\ revealSigned = FALSE

Preflight(valid) ==
  /\ phase = "preflight"
  /\ valid \in BOOLEAN
  /\ preflightValid' = valid
  /\ phase' =
       IF ValidatePreApprovalQuote /\ ~valid
         THEN "done"
         ELSE "awaiting-consent"
  /\ UNCHANGED <<
       consented,
       canceled,
       routeMatches,
       extraAuthority,
       allowanceExact,
       reviewedSetupFee,
       freshSetupFee,
       remainingBalance,
       revealReserve,
       setupSigner,
       revealSigner,
       setupSigned,
       setupSubmitted,
       revealSigned
     >>

Approve ==
  /\ phase = "awaiting-consent"
  /\ ~canceled
  /\ consented' = TRUE
  /\ UNCHANGED <<
       phase,
       preflightValid,
       canceled,
       routeMatches,
       extraAuthority,
       allowanceExact,
       reviewedSetupFee,
       freshSetupFee,
       remainingBalance,
       revealReserve,
       setupSigner,
       revealSigner,
       setupSigned,
       setupSubmitted,
       revealSigned
     >>

Decline ==
  /\ phase = "awaiting-consent"
  /\ phase' = "done"
  /\ UNCHANGED <<
       preflightValid,
       consented,
       canceled,
       routeMatches,
       extraAuthority,
       allowanceExact,
       reviewedSetupFee,
       freshSetupFee,
       remainingBalance,
       revealReserve,
       setupSigner,
       revealSigner,
       setupSigned,
       setupSubmitted,
       revealSigned
     >>

Cancel ==
  /\ phase \in {"awaiting-consent", "prepared"}
  /\ canceled' = TRUE
  /\ UNCHANGED <<
       phase,
       preflightValid,
       consented,
       routeMatches,
       extraAuthority,
       allowanceExact,
       reviewedSetupFee,
       freshSetupFee,
       remainingBalance,
       revealReserve,
       setupSigner,
       revealSigner,
       setupSigned,
       setupSubmitted,
       revealSigned
     >>

Prepare(matches, hasExtraAuthority, exactAllowance, fee) ==
  /\ phase = "awaiting-consent"
  /\ consented
  /\ ~canceled
  /\ matches \in BOOLEAN
  /\ hasExtraAuthority \in BOOLEAN
  /\ exactAllowance \in BOOLEAN
  /\ fee \in FeeValues
  /\ phase' = "prepared"
  /\ routeMatches' = matches
  /\ extraAuthority' = hasExtraAuthority
  /\ allowanceExact' = exactAllowance
  /\ freshSetupFee' = fee
  /\ UNCHANGED <<
       preflightValid,
       consented,
       canceled,
       reviewedSetupFee,
       remainingBalance,
       revealReserve,
       setupSigner,
       revealSigner,
       setupSigned,
       setupSubmitted,
       revealSigned
     >>

SignSetup ==
  /\ phase = "prepared"
  /\ consented
  /\ (~RejectCanceledAttempt \/ ~canceled)
  /\ (~ValidatePreparedRoute \/ routeMatches)
  /\ (~RejectExtraAuthority \/ ~extraAuthority)
  /\ (~BindFeeToReviewedSetup \/ freshSetupFee <= reviewedSetupFee)
  /\ (~RecheckExactAllowance \/ allowanceExact)
  /\ phase' = "setup-signed"
  /\ setupSigner' = "owner"
  /\ setupSigned' = TRUE
  /\ UNCHANGED <<
       preflightValid,
       consented,
       canceled,
       routeMatches,
       extraAuthority,
       allowanceExact,
       reviewedSetupFee,
       freshSetupFee,
       remainingBalance,
       revealReserve,
       revealSigner,
       setupSubmitted,
       revealSigned
     >>

SubmitSetup ==
  /\ phase = "setup-signed"
  /\ phase' = "setup-submitted"
  /\ setupSubmitted' = TRUE
  /\ remainingBalance' = remainingBalance - freshSetupFee
  /\ UNCHANGED <<
       preflightValid,
       consented,
       canceled,
       routeMatches,
       extraAuthority,
       allowanceExact,
       reviewedSetupFee,
       freshSetupFee,
       revealReserve,
       setupSigner,
       revealSigner,
       setupSigned,
       revealSigned
     >>

SignReveal ==
  /\ phase = "setup-submitted"
  /\ remainingBalance >= revealReserve
  /\ phase' = "done"
  /\ revealSigner' = IF PreserveRevealSession THEN "session" ELSE "owner"
  /\ revealSigned' = TRUE
  /\ UNCHANGED <<
       preflightValid,
       consented,
       canceled,
       routeMatches,
       extraAuthority,
       allowanceExact,
       reviewedSetupFee,
       freshSetupFee,
       remainingBalance,
       revealReserve,
       setupSigner,
       setupSigned,
       setupSubmitted
     >>

Done ==
  /\ phase = "done"
  /\ UNCHANGED vars

Next ==
  \/ \E valid \in BOOLEAN : Preflight(valid)
  \/ Approve
  \/ Decline
  \/ Cancel
  \/ \E matches \in BOOLEAN,
        hasExtraAuthority \in BOOLEAN,
        exactAllowance \in BOOLEAN,
        fee \in FeeValues:
       Prepare(matches, hasExtraAuthority, exactAllowance, fee)
  \/ SignSetup
  \/ SubmitSetup
  \/ SignReveal
  \/ Done

Spec == Init /\ [][Next]_vars

TypeOK ==
  /\ phase \in Phases
  /\ preflightValid \in BOOLEAN
  /\ consented \in BOOLEAN
  /\ canceled \in BOOLEAN
  /\ routeMatches \in BOOLEAN
  /\ extraAuthority \in BOOLEAN
  /\ allowanceExact \in BOOLEAN
  /\ reviewedSetupFee \in FeeValues
  /\ freshSetupFee \in FeeValues
  /\ remainingBalance \in 0..2
  /\ revealReserve \in 0..2
  /\ setupSigner \in Signers
  /\ revealSigner \in Signers
  /\ setupSigned \in BOOLEAN
  /\ setupSubmitted \in BOOLEAN
  /\ revealSigned \in BOOLEAN

ApprovalRequiresValidPreflight == consented => preflightValid
ConsentBeforeOwnerSignature == setupSigned => consented
CanceledAttemptSignsNothing == canceled => ~setupSigned
OwnerSignsRequestedRoute == setupSigned => routeMatches
OwnerSignsNoExtraAuthority == setupSigned => ~extraAuthority
OwnerSignsWithinReviewedSetupFee ==
  setupSigned => freshSetupFee <= reviewedSetupFee
ExactAllowanceBeforeOwnerSignature == setupSigned => allowanceExact
RevealReserveIsPreserved == setupSubmitted => remainingBalance >= revealReserve
RevealReturnsToSession == revealSigned => revealSigner = "session"

====
