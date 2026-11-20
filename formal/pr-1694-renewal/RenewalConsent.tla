---- MODULE RenewalConsent ----
EXTENDS Integers, TLC

CONSTANTS
  RequireFreshConsent,
  DeclineOnCancel,
  RejectStaleAttempt,
  ShowUnlimitedDisclosure,
  KeepPromptReceipt,
  DeriveApprovalFromBothTokens

DebitValues == 0..2
Phases == {"waiting", "reviewing", "ready-to-sign", "signed", "done"}

VARIABLES
  phase,
  confirmedUsdc,
  confirmedToken,
  quotedUsdc,
  quotedToken,
  currentAttempt,
  promptAttempt,
  accepted,
  signed,
  submitted,
  canceled,
  unlimitedAllowance,
  disclosureVisible,
  usdcPermitRequired,
  tokenPermitRequired,
  approvalRequired,
  screenUsesPrompt

vars == <<
  phase,
  confirmedUsdc,
  confirmedToken,
  quotedUsdc,
  quotedToken,
  currentAttempt,
  promptAttempt,
  accepted,
  signed,
  submitted,
  canceled,
  unlimitedAllowance,
  disclosureVisible,
  usdcPermitRequired,
  tokenPermitRequired,
  approvalRequired,
  screenUsesPrompt
>>

Init ==
  /\ phase = "waiting"
  /\ confirmedUsdc = 1
  /\ confirmedToken = 1
  /\ quotedUsdc = 1
  /\ quotedToken = 1
  /\ currentAttempt = 2
  /\ promptAttempt = 2
  /\ accepted = FALSE
  /\ signed = FALSE
  /\ submitted = FALSE
  /\ canceled = FALSE
  /\ unlimitedAllowance = FALSE
  /\ disclosureVisible = FALSE
  /\ usdcPermitRequired = FALSE
  /\ tokenPermitRequired = FALSE
  /\ approvalRequired = FALSE
  /\ screenUsesPrompt = FALSE

HasIncrease(usdc, token) ==
  usdc > confirmedUsdc \/ token > confirmedToken

ReceiveCurrentPrompt(usdc, token, unlimited, usdcPermit, tokenPermit) ==
  /\ phase = "waiting"
  /\ usdc \in DebitValues
  /\ token \in DebitValues
  /\ unlimited \in BOOLEAN
  /\ usdcPermit \in BOOLEAN
  /\ tokenPermit \in BOOLEAN
  /\ quotedUsdc' = usdc
  /\ quotedToken' = token
  /\ promptAttempt' = currentAttempt
  /\ unlimitedAllowance' = unlimited
  /\ disclosureVisible' = (~unlimited \/ ShowUnlimitedDisclosure)
  /\ usdcPermitRequired' = usdcPermit
  /\ tokenPermitRequired' = tokenPermit
  /\ approvalRequired' =
       IF DeriveApprovalFromBothTokens
         THEN usdcPermit \/ tokenPermit
         ELSE usdcPermit
  /\ screenUsesPrompt' = KeepPromptReceipt
  /\ phase' =
       IF HasIncrease(usdc, token) /\ RequireFreshConsent
         THEN "reviewing"
         ELSE "ready-to-sign"
  /\ UNCHANGED <<
       confirmedUsdc,
       confirmedToken,
       currentAttempt,
       accepted,
       signed,
       submitted,
       canceled
     >>

ReceiveStalePrompt(usdc, token, unlimited, usdcPermit, tokenPermit) ==
  /\ phase = "waiting"
  /\ usdc \in DebitValues
  /\ token \in DebitValues
  /\ unlimited \in BOOLEAN
  /\ usdcPermit \in BOOLEAN
  /\ tokenPermit \in BOOLEAN
  /\ IF RejectStaleAttempt
        THEN UNCHANGED vars
        ELSE
          /\ quotedUsdc' = usdc
          /\ quotedToken' = token
          /\ promptAttempt' = currentAttempt - 1
          /\ unlimitedAllowance' = unlimited
          /\ disclosureVisible' = (~unlimited \/ ShowUnlimitedDisclosure)
          /\ usdcPermitRequired' = usdcPermit
          /\ tokenPermitRequired' = tokenPermit
          /\ approvalRequired' =
               IF DeriveApprovalFromBothTokens
                 THEN usdcPermit \/ tokenPermit
                 ELSE usdcPermit
          /\ screenUsesPrompt' = KeepPromptReceipt
          /\ phase' =
               IF HasIncrease(usdc, token) /\ RequireFreshConsent
                 THEN "reviewing"
                 ELSE "ready-to-sign"
          /\ UNCHANGED <<
               confirmedUsdc,
               confirmedToken,
               currentAttempt,
               accepted,
               signed,
               submitted,
               canceled
             >>

Accept ==
  /\ phase = "reviewing"
  /\ phase' = "ready-to-sign"
  /\ accepted' = TRUE
  /\ UNCHANGED <<
       confirmedUsdc,
       confirmedToken,
       quotedUsdc,
       quotedToken,
       currentAttempt,
       promptAttempt,
       signed,
       submitted,
       canceled,
       unlimitedAllowance,
       disclosureVisible,
       usdcPermitRequired,
       tokenPermitRequired,
       approvalRequired,
       screenUsesPrompt
     >>

Cancel ==
  /\ phase = "reviewing"
  /\ canceled' = TRUE
  /\ phase' = IF DeclineOnCancel THEN "done" ELSE "ready-to-sign"
  /\ UNCHANGED <<
       confirmedUsdc,
       confirmedToken,
       quotedUsdc,
       quotedToken,
       currentAttempt,
       promptAttempt,
       accepted,
       signed,
       submitted,
       unlimitedAllowance,
       disclosureVisible,
       usdcPermitRequired,
       tokenPermitRequired,
       approvalRequired,
       screenUsesPrompt
     >>

Sign ==
  /\ phase = "ready-to-sign"
  /\ phase' = "signed"
  /\ signed' = TRUE
  /\ UNCHANGED <<
       confirmedUsdc,
       confirmedToken,
       quotedUsdc,
       quotedToken,
       currentAttempt,
       promptAttempt,
       accepted,
       submitted,
       canceled,
       unlimitedAllowance,
       disclosureVisible,
       usdcPermitRequired,
       tokenPermitRequired,
       approvalRequired,
       screenUsesPrompt
     >>

Submit ==
  /\ phase = "signed"
  /\ phase' = "done"
  /\ submitted' = TRUE
  /\ UNCHANGED <<
       confirmedUsdc,
       confirmedToken,
       quotedUsdc,
       quotedToken,
       currentAttempt,
       promptAttempt,
       accepted,
       signed,
       canceled,
       unlimitedAllowance,
       disclosureVisible,
       usdcPermitRequired,
       tokenPermitRequired,
       approvalRequired,
       screenUsesPrompt
     >>

Done ==
  /\ phase = "done"
  /\ UNCHANGED vars

Next ==
  \/ \E usdc \in DebitValues,
        token \in DebitValues,
        unlimited \in BOOLEAN,
        usdcPermit \in BOOLEAN,
        tokenPermit \in BOOLEAN:
       ReceiveCurrentPrompt(usdc, token, unlimited, usdcPermit, tokenPermit)
  \/ \E usdc \in DebitValues,
        token \in DebitValues,
        unlimited \in BOOLEAN,
        usdcPermit \in BOOLEAN,
        tokenPermit \in BOOLEAN:
       ReceiveStalePrompt(usdc, token, unlimited, usdcPermit, tokenPermit)
  \/ Accept
  \/ Cancel
  \/ Sign
  \/ Submit
  \/ Done

Spec == Init /\ [][Next]_vars

TypeOK ==
  /\ phase \in Phases
  /\ confirmedUsdc \in DebitValues
  /\ confirmedToken \in DebitValues
  /\ quotedUsdc \in DebitValues
  /\ quotedToken \in DebitValues
  /\ currentAttempt \in 1..2
  /\ promptAttempt \in 1..2
  /\ accepted \in BOOLEAN
  /\ signed \in BOOLEAN
  /\ submitted \in BOOLEAN
  /\ canceled \in BOOLEAN
  /\ unlimitedAllowance \in BOOLEAN
  /\ disclosureVisible \in BOOLEAN
  /\ usdcPermitRequired \in BOOLEAN
  /\ tokenPermitRequired \in BOOLEAN
  /\ approvalRequired \in BOOLEAN
  /\ screenUsesPrompt \in BOOLEAN

NoUnconsentedIncrease ==
  signed =>
    ((quotedUsdc <= confirmedUsdc /\ quotedToken <= confirmedToken) \/ accepted)

CancelNeverSigns == canceled => (~signed /\ ~submitted)

CurrentAttemptOwnsPrompt ==
  phase \in {"reviewing", "ready-to-sign", "signed"}
    => promptAttempt = currentAttempt

UnlimitedApprovalIsDisclosed ==
  (unlimitedAllowance /\ phase \in {"reviewing", "ready-to-sign", "signed", "done"})
    => disclosureVisible

PromptReceiptRemainsVisible ==
  phase \in {"reviewing", "ready-to-sign", "signed"} => screenUsesPrompt

ApprovalStepMatchesEitherCoin ==
  phase \in {"reviewing", "ready-to-sign", "signed"}
    => approvalRequired = (usdcPermitRequired \/ tokenPermitRequired)

====
