---------------------- MODULE RegistrationPayment ----------------------
EXTENDS Naturals

\* Payment-confirmation snapshot model for
\* src/features/register-v2/workflow/pricing/BEHAVIOUR.md.
\*
\* The required behaviour is that the payment method and figures shown when
\* the user clicks remain the confirmation for the whole attempt. Query-cache
\* notifications, React renders, fallback effects, mutation-state updates, and
\* each continuation after an await are modeled as separate actions.
\*
\* Source mapping:
\* - UserSelect / FallbackSelect: pricing.token.select,
\*   pricing.fundingSource.select, and pricing.paymentAsset.select.
\* - ClickPayment: PaymentAction invokes onNext, which starts the availability
\*   mutation.
\* - RefreshFigures: a balance, budget, L2 quote, or ETH quote changes the
\*   payment props without changing the XState actor snapshot.
\* - ObserveBusy: TokenPickerContentBase first observes isBusy=true and
\*   useHeldWhile captures that render's props.
\* - DispatchRegistrationStart: startRegistration validates the captured
\*   XState snapshot and sends registration.start after its asynchronous work.

CONSTANTS CaptureViewAtClick,
          HoldViewWhileBusy,
          LockSelectionAtClick,
          BindStartMethodToClick,
          BindStartFiguresToClick,
          AbortOnActorChange

ASSUME /\ CaptureViewAtClick \in BOOLEAN
       /\ HoldViewWhileBusy \in BOOLEAN
       /\ LockSelectionAtClick \in BOOLEAN
       /\ BindStartMethodToClick \in BOOLEAN
       /\ BindStartFiguresToClick \in BOOLEAN
       /\ AbortOnActorChange \in BOOLEAN

\* Distinct L2 values make a silent chain switch observable, rather than
\* collapsing every bridge route into one abstract "l2" method.
Methods == {"wallet", "l2-base", "l2-optimism", "eth"}
Figures == {"clicked-figures", "refreshed-figures"}
Phases == {"choosing", "clicked", "busy", "started", "aborted", "settled"}
InFlightPhases == {"clicked", "busy", "started"}
NoMethod == "no-method"
NoFigures == "no-figures"

VARIABLES phase,
          liveMethod,
          liveFigures,
          displayedMethod,
          displayedFigures,
          confirmedMethod,
          confirmedFigures,
          actorRevision,
          clickedActorRevision,
          startedMethod,
          startedFigures,
          startCount

vars == <<phase,
          liveMethod,
          liveFigures,
          displayedMethod,
          displayedFigures,
          confirmedMethod,
          confirmedFigures,
          actorRevision,
          clickedActorRevision,
          startedMethod,
          startedFigures,
          startCount>>

Init ==
  /\ phase = "choosing"
  /\ liveMethod = "wallet"
  /\ liveFigures = "clicked-figures"
  /\ displayedMethod = liveMethod
  /\ displayedFigures = liveFigures
  /\ confirmedMethod = NoMethod
  /\ confirmedFigures = NoFigures
  /\ actorRevision = 0
  /\ clickedActorRevision = 0
  /\ startedMethod = NoMethod
  /\ startedFigures = NoFigures
  /\ startCount = 0

CanChangeSelection ==
  phase = "choosing" \/ (phase = "clicked" /\ ~LockSelectionAtClick)

Select(method) ==
  /\ CanChangeSelection
  /\ actorRevision < 2
  /\ method \in Methods
  /\ method # liveMethod
  /\ liveMethod' = method
  /\ displayedMethod' =
       IF phase = "clicked" /\ CaptureViewAtClick
         THEN displayedMethod
         ELSE method
  /\ actorRevision' = actorRevision + 1
  /\ UNCHANGED <<phase,
                 liveFigures,
                 displayedFigures,
                 confirmedMethod,
                 confirmedFigures,
                 clickedActorRevision,
                 startedMethod,
                 startedFigures,
                 startCount>>

UserSelect(method) == Select(method)
FallbackSelect(method) == Select(method)

ClickPayment ==
  /\ phase = "choosing"
  /\ phase' = "clicked"
  /\ confirmedMethod' = displayedMethod
  /\ confirmedFigures' = displayedFigures
  /\ clickedActorRevision' = actorRevision
  /\ UNCHANGED <<liveMethod,
                 liveFigures,
                 displayedMethod,
                 displayedFigures,
                 actorRevision,
                 startedMethod,
                 startedFigures,
                 startCount>>

\* One later value is enough to expose every ordering bug in this abstraction:
\* the refresh can happen before the click, between click and busy observation,
\* or while busy.
RefreshFigures ==
  /\ phase \in {"choosing", "clicked", "busy"}
  /\ liveFigures = "clicked-figures"
  /\ liveFigures' = "refreshed-figures"
  /\ displayedFigures' =
       IF phase = "clicked" /\ CaptureViewAtClick
         THEN displayedFigures
         ELSE IF phase = "busy" /\ HoldViewWhileBusy
           THEN displayedFigures
           ELSE "refreshed-figures"
  /\ UNCHANGED <<phase,
                 liveMethod,
                 displayedMethod,
                 confirmedMethod,
                 confirmedFigures,
                 actorRevision,
                 clickedActorRevision,
                 startedMethod,
                 startedFigures,
                 startCount>>

\* React has now committed the mutation's pending state. Without click-time
\* capture, useHeldWhile holds whatever method and figures are live in this
\* render, which may already include a query or selection update.
ObserveBusy ==
  /\ phase = "clicked"
  /\ phase' = "busy"
  /\ displayedMethod' =
       IF CaptureViewAtClick THEN confirmedMethod ELSE liveMethod
  /\ displayedFigures' =
       IF CaptureViewAtClick THEN confirmedFigures ELSE liveFigures
  /\ UNCHANGED <<liveMethod,
                 liveFigures,
                 confirmedMethod,
                 confirmedFigures,
                 actorRevision,
                 clickedActorRevision,
                 startedMethod,
                 startedFigures,
                 startCount>>

\* When the implementation does not explicitly bind start data to the click,
\* callback/render scheduling may supply either the clicked closure or a later
\* one. Modeling both is deliberate: a safety guarantee must hold for every
\* permitted scheduling choice.
StartMethodCandidates ==
  IF BindStartMethodToClick
    THEN {confirmedMethod}
    ELSE {confirmedMethod, liveMethod}

StartFigureCandidates ==
  IF BindStartFiguresToClick
    THEN {confirmedFigures}
    ELSE {confirmedFigures, liveFigures}

DispatchRegistrationStart ==
  /\ phase = "busy"
  /\ IF AbortOnActorChange /\ actorRevision # clickedActorRevision
       THEN /\ phase' = "aborted"
            /\ UNCHANGED <<startedMethod, startedFigures, startCount>>
       ELSE /\ phase' = "started"
            /\ \E method \in StartMethodCandidates:
                 \E figures \in StartFigureCandidates:
                   /\ startedMethod' = method
                   /\ startedFigures' = figures
                   /\ startCount' = startCount + 1
  /\ UNCHANGED <<liveMethod,
                 liveFigures,
                 displayedMethod,
                 displayedFigures,
                 confirmedMethod,
                 confirmedFigures,
                 actorRevision,
                 clickedActorRevision>>

Finish ==
  /\ phase \in {"started", "aborted"}
  /\ phase' = "settled"
  /\ UNCHANGED <<liveMethod,
                 liveFigures,
                 displayedMethod,
                 displayedFigures,
                 confirmedMethod,
                 confirmedFigures,
                 actorRevision,
                 clickedActorRevision,
                 startedMethod,
                 startedFigures,
                 startCount>>

Done ==
  /\ phase = "settled"
  /\ UNCHANGED vars

Next ==
  \/ ClickPayment
  \/ RefreshFigures
  \/ \E method \in Methods: UserSelect(method)
  \/ \E method \in Methods: FallbackSelect(method)
  \/ ObserveBusy
  \/ DispatchRegistrationStart
  \/ Finish
  \/ Done

Spec == Init /\ [][Next]_vars

TypeOK ==
  /\ phase \in Phases
  /\ liveMethod \in Methods
  /\ liveFigures \in Figures
  /\ displayedMethod \in Methods
  /\ displayedFigures \in Figures
  /\ confirmedMethod \in Methods \cup {NoMethod}
  /\ confirmedFigures \in Figures \cup {NoFigures}
  /\ actorRevision \in 0..2
  /\ clickedActorRevision \in 0..2
  /\ startedMethod \in Methods \cup {NoMethod}
  /\ startedFigures \in Figures \cup {NoFigures}
  /\ startCount \in 0..1

\* From the click through registration start, the sheet displays exactly the
\* method and payment bounds that the user confirmed.
InFlightViewMatchesClick ==
  phase \in InFlightPhases =>
    /\ displayedMethod = confirmedMethod
    /\ displayedFigures = confirmedFigures

\* No user or fallback selection rewrites the accepted rail while preparation
\* is pending. If product wants a new selection, it must be a new confirmation.
PendingSelectionIsStable ==
  phase \in InFlightPhases =>
    /\ liveMethod = confirmedMethod
    /\ actorRevision = clickedActorRevision

\* A changed XState selection may abort, but must never proceed as the old
\* click. This separately proves the value of the actor-snapshot guard.
ChangedActorNeverStarts ==
  phase = "started" => actorRevision = clickedActorRevision

\* The registration event uses the exact rail and consent-relevant upper bounds
\* from the click. A revalidation may reject them; it may not silently replace
\* them with later values.
StartedPaymentMatchesClick ==
  phase = "started" =>
    /\ startedMethod = confirmedMethod
    /\ startedFigures = confirmedFigures

=============================================================================
