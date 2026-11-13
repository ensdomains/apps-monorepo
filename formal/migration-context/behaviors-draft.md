> Superseded by [`BEHAVIORS.md`](../../apps/manager/verification/migration/BEHAVIORS.md); do not edit this draft.

# ENS manager v1→v2 migration: candidate behaviours for a formal model (DRAFT for David)

Baseline: `origin/main` 6977db2d7 (2026-11-12 00:28 UTC+8), worktree `apps-monorepo-formal-verification`, branch `formal/migration-model`.
Short paths: `M/` = `apps/manager/src/features/migration/`, `svc` = `M/service/migrationService.ts`, `ui` = `M/state/migrationUi.machine.ts`.
Notes and raw evidence: `/workspace/fv-migration/notes/` (code-map.md, mm-branches.md, linear.md, slack.md, fv-pr-conventions.md, exploration-models.md).

Tags: **VERIFIED** means the behaviour is stated or enforced in the cited source (code line, merged PR, Linear decision, or Slack decision). **GUESS** means I inferred it and David needs to confirm it. "main: holds" or "main: VIOLATED" says what I expect the Current.cfg run to show on 6977db2d7. The main column is a code reading only; nothing has been model-checked yet.

---

## 1. The flow

**Actors.** The owner's EOA/wallet; the owner's HCA (Rhinestone smart account) acting through `executeByOwner`; the MigrationHelper and v2 contracts (PermissionedRegistry, WrapperRegistry, resolvers); the v1 contracts (ENS registry, BaseRegistrar, NameWrapper fuses); the indexer/RPC (reads, receipts); other browser tabs sharing the same localStorage; the user (select, confirm, reject, retry, leave).

**Per-name categories** (`packages/migration/src/service/classifyNames.ts` L519): *migrate* (unwrapped, unlocked, locked-2ld, locked-child, detached-child) or *copy* (unlocked-child, registry-child). A copy must chain to a copy root, i.e. a .eth 2LD that is itself being migrated (copyRouteGap L588-607). Otherwise the name is *ineligible* with a reason (not-transferable, unsupported-resolver, unknown-label, invalid-label, missing-parent, expired-registration, parent-upgraded, locked-parent, …). Extra per-name work: grace renewal, wrapper sync, record replay, manager restoration (opt-in, `ui` L89-93) and subname recreation.

**UI states** (`ui`): `select` → (`hasSelection` L337-340) → `migrate.renewing` (grace renewal; `renewAndStart` L574-580 requires quote items > 0, domains > 0, balance ≥ total) → `preparing` → `running` → `landing`/`reuniting` → `success`. Any `migration.failed` event or failing step → `failing` → `failure`. From `failure`, `retry` is allowed only if `canRetryMigration` holds (L756-775; `decodeMigrationError.ts` L331 rejects `plan-changed`). `resetForRetry` (L518-545) calls `adjustPlanForRetry(plan, completedNames)` and sets `reconcileBeforeSubmit=true`. The run actor holds a `submissionGate` AbortController and ignores events after cancel (L281-333).

**Service steps** (`svc executeMigration` L2590-2797):
1. Snapshot and recovery-scope checks; reconcile any temporary registration approval.
2. `prepareExecutionPlan`: reconcile journaled submissions (receipt → verify, or revert → ownership check, or *unresolved*), adjust the plan for retry, `commitReconciliationJournal` (persists recovery before deleting evidence, L2239-2270), and `reconcileMigrationRetry` when `reconcileBeforeSubmit` is set.
3. If names remain, run the preflight in order: locked resolvers unchanged (L2663), atomic batching available, no live subregistry overwrite (L2678, WEB-1249), copy readiness, approval plan current (L2703-2707), `ensureMigrationSetup` (HCA grants), persist the recovery plan.
4. `executeRemainingAtomicBatches` (L2414-2562), per batch:
   - re-check copy readiness and supported subnames (L2438-2454);
   - wallet record replay;
   - subname recreation unchanged;
   - `gate.throwIfAborted` (L2479);
   - **persist intent + recovery** (`persistPendingAtomicMigrationAttempt`);
   - wallet prompt;
   - on hash: persist the submission, drop the intent (L2489-2505);
   - on receipt: verify the post-state at `receipt.blockNumber` (L2524-2528), then **checkpoint**, then persist the remaining recovery, *then* delete the submission (L2529-2545);
   - a user rejection before any hash removes only the intent (L2554-2556).
5. Fresh-deployment preview needed → release and `PlanChanged` (L2734-2744). Historical deployment → restore the checkpoint or `MigrationHistoricalDeploymentError`, "No names will be submitted again" (L2745-2772). Then clear the completed journal and dedupe results by name.

**Durable state.** The localStorage journal per scope (chainId, owner, hca) in `M/service/migrationBatchJournal.ts` holds `intents`, `submissions{hash,names,intentId}`, the `recovery` snapshot, and completion checkpoints (`migrationCompletionCheckpoint.ts`).

---

## 2. Candidate behaviours

### A. Wallet-prompt and submission safety
| # | Behaviour (end-user promise) | Tag / source | main | mm |
|---|---|---|---|---|
| A1 | **At most one execution per scope** (chain, owner, HCA) can reach a wallet prompt at a time, across tabs and re-mounts. | VERIFIED intent: WEB-1942 #1 ("Done": per-scope Web Lock); WEB-1978 MM-001/049; fix branch `fix/mm-001` ddcd52dbe. | **VIOLATED?** There is no execution lock on main (`git grep navigator.locks` finds only NFT claim + graceRenewalPending; PR #1588 closed unmerged). | MM-001, 049, 019 |
| A2 | **No wallet prompt after teardown/cancel**: once the user leaves or the run is cancelled, no further submission starts. | VERIFIED: `svc` L596, L2479 `submissionGate.signal.throwIfAborted()`; `ui` L281-333; PR #1520 13eabac62. | holds | MM-013 |
| A3 | **Intent before prompt**: every atomic-batch wallet prompt is preceded by a durable intent plus recovery snapshot written in one journal write. | VERIFIED: `svc` L2479-2487; PR #1526 ac22f4e78; pstack `IntentBeforeWalletPrompt`. *Known exception:* the wallet record-replay prompt opens before its intent (MM-050, Low). | holds (batches); replay excepted | MM-003, 050 |
| A4 | **Hash replaces intent**: once a hash is known it is journaled before the intent is dropped; a replaced/sped-up hash supersedes the old one, so a submission is never untracked. | VERIFIED: `svc` L2489-2505, L609-614; pstack `HashReplacesIntent`. | holds | MM-048 |
| A5 | **Never re-prompt while an earlier attempt may still land**: a journaled hash whose receipt is unavailable is only treated as "absent" when the chain definitively says the tx is unknown; otherwise the names stay locked (no new submission). | VERIFIED intent: WEB-1978 open Medium MM-039/048/049 (fix direction: getTransaction); `fix/mm-039` 6b950b8ee. | **VIOLATED**: `getSubmittedBatchReceipt` L1513-1529 maps every receipt error to indeterminate, and with `allowStateFallback` that becomes `'unresolved'` (L1677-1685), so a retry can rely on state alone. | MM-039, 048, 049 |
| A6 | **Reverted attempt is retried only if the user still holds the v1 source tokens.** | VERIFIED: `svc` L1568-1576 `assertSourceTokensOwnedForRetry` before clearing evidence. | holds | - |
| A7 | **User rejection without a hash** discards only that intent; completed work and other evidence stay. | VERIFIED: `svc` L2554-2556. | holds | - |
| A8 | **Approvals match the preview**: no HCA grant/approval beyond what the reviewed plan showed; a retry may reuse grants already completed but not add new ones. Every temporary grant is eventually revoked or recorded for cleanup. | VERIFIED (first part): `svc` L2703-2707 `assertMigrationApprovalPlanCurrent`. GUESS (second part): the revoke liveness is inferred from #1530 cleanup-only recovery and WEB-1946 #1. | holds / ? | MM-014, 023 |

### B. Freshness and authority at submit time
| # | Behaviour | Tag / source | main | mm |
|---|---|---|---|---|
| B1 | **Re-check before every batch**: source ownership, copy readiness, supported subnames and recreation snapshot are re-read immediately before each batch, not only at preview. A change → `plan-changed`, nothing submitted. | VERIFIED: `svc` L2438-2454, L2663, L2678; PR #1758 6260f162d ("re-read the V1 manager and resolver before encoding"). | holds | MM-015 (copy only) |
| B2 | **No stale authority restored**: migration never re-grants a manager or resolver that is no longer current in v1. Manager restoration happens only by explicit user opt-in. | VERIFIED: Slack, Immunefi stale-manager group rated Critical (Yoginth 2026-09-07); #1758; `ui` L89-93 (default empty). | holds | - |
| B3 | **No live subregistry overwrite**: migration never replaces a name's live v2 subregistry (detaching existing subnames). | VERIFIED: `M/service/migrationInvariants.ts` L396-420; WEB-1249. | holds | - |
| B4 | **Locked-name record control**: a locked (CANNOT_SET_RESOLVER) name must not end with an uncertified non-zero resolver after the v1 token moves to the Graveyard. | VERIFIED: PR #1522 407ee82a0; exploration REPORT lesson (#1500 regression was missed). Slack: an *already-malicious* locked resolver is won't-fix (Nick 2026-10-20). | holds | MM-035 |
| B5 | **Exact authority granted**: after migration, each account holds exactly the planned role bitmap (owner, wrapper root, manager), no more. | VERIFIED for manager: #1529 740bcf504, `verifyAtomicMigrationBatch.ts` L524 `roles()`. GUESS for owner/wrapper-root: WEB-1978 calls 009/010 "not bugs, optional hardening"; main uses `hasRoles` subset at L369/L412. | manager holds; owner/root: subset only | MM-004, 009, 010 |
| B6 | **Verification reads the certified registry path**: each traversal step is bound to the expected registry, so a foreign subregistry can't satisfy verification. | GUESS (as an invariant): `fix/mm-032` 0d989026e; WEB-1978 says not a bug (needs an impossible state). | not bound | MM-032 |

### C. Completion truth
| # | Behaviour | Tag / source | main | mm |
|---|---|---|---|---|
| C1 | **Complete only with proof**: a name is reported migrated only after a successful receipt *and* post-state verification at that receipt's block. | VERIFIED: `svc` L2524-2528; pstack `CompletionRequiresVerifiedProof`. | holds | - |
| C2 | **Checkpoint before evidence deletion**: the submission is deleted only after the completion checkpoint and the remaining-plan recovery are durable. A crash at any point leaves enough evidence to resume. | VERIFIED: `svc` L2529-2545, `commitReconciliationJournal` L2239-2270; pstack `SuccessfulJournalRemovalRequiresCheckpoint`. | holds | MM-003 |
| C3 | **Each name's action is immutable**: a name planned as migrate is never later counted as copy (or vice versa), and a journaled submission whose action mismatches the plan is a hard error, not a state fallback. | VERIFIED: `ui` L463-466, L497-503; `svc` L1670-1673. | holds | - |
| C4 | **No false "all upgraded"**: dashboard/NFT completion is claimed only when every selected name's required work is done (including grace renewal, wrapper sync and cleanup), and stale journal entries do not block a true completion. | VERIFIED as a gap: exploration `MigrationCompletionTruth.NoFalseCompletion` fails (grace/sync omitted); WEB-1946 #4; pr-targeted found needs-sync counted complete. Whether it is fixed on main after #1712 is not checked. | ? | - |
| C5 | **Success/failure reported truthfully**: the run ends in failure iff verified work is missing; partial success is shown as partial, and cached views refresh. An unplanned grant turning active mid-run doesn't flip a verified success to failure. | VERIFIED: `ui` L341-345 `isOnlyFailures`; WEB-1946 #3 (#1712). GUESS that the query refresh belongs to the model: MM-007 is Low and its fix is unmerged (`MigrationPage.tsx` L441-457 refreshes only on success). | partly | MM-007 |
| C6 | **Historical deployment never resubmits**: evidence from an old helper deployment is either restored from its checkpoint or blocks with "No names will be submitted again". | VERIFIED: `svc` L2745-2772. | holds | - |

### D. Journal, recovery and retry
| # | Behaviour | Tag / source | main | mm |
|---|---|---|---|---|
| D1 | **Retry keeps exactly the remaining work**: after any failure/back-and-forth, the retry plan contains every non-completed operation (matched by name+action) and none of the completed ones. | VERIFIED: `ui` L518-545; WEB-1942 #4; `fix/mm-002` 3fa4f10ee. | identity bug present (`buildMigrationPlan.ts` L1268 `includes`); WEB-1978 says not reachable today | MM-002 |
| D2 | **Recovery evidence is never lost while an attempt is recorded**: a recovery snapshot is discarded only if it is unchanged and no intents/submissions reference it (no stale-effect deletion). | VERIFIED intent: WEB-1942 (MM-024 tracked); `fix/mm-024` baf2c0f0c. | **VIOLATED?** (`hooks/useMigrationRecoverySnapshot.ts` discards by scope) | MM-024 |
| D3 | **No lost update across tabs**: concurrent journal writers never overwrite each other's intent/submission. | VERIFIED as a finding: WEB-1978 MM-019 Low; `fix/mm-019` (CAS + Web Lock). Whether this is a required invariant → Q3. | VIOLATED (read-modify-write, no CAS) | MM-019 |
| D4 | **Cleanup-only recovery can finish**: when no names remain but grants/evidence need cleanup, the user can still run it. | VERIFIED: PR #1530 4f9dd5be6; `ui` L337-340 (`requiresReconciliation`). | holds | MM-014, 023 |
| D5 | **Uncertainty keeps evidence**: when reconciliation is blocked (indeterminate receipt, read failure) the journal is retained and no new prompt is opened. | VERIFIED: pstack `BlockedUncertaintyKeepsRetryEvidence`; `svc` L1677-1685; `copy-read-failed` is distinct from plan-changed (`decodeMigrationError.ts` L338-345). | holds except A5 | MM-039 |

### E. Atomicity and plan totality
| # | Behaviour | Tag / source | main | mm |
|---|---|---|---|---|
| E1 | **All-or-nothing per name and per subname tree**: a name's operations and its whole recreation tree land in one outer atomic call or not at all; a tree too large for one call is refused, never split. | VERIFIED: `buildAtomicMigrationBatches.ts` L1608-1612; PR #1536 7c7c00b33; WEB-1942; Slack (Yoginth 2026-09-23, Florin 2026-11-11). | holds | - |
| E2 | **Record replay at most once**: wallet-replayed records are not replayed again after a successful replay. | VERIFIED: `svc` replay skip `walletReplayAlreadyApplied` (~L2363-2380); MM-050 (only a duplicate identical replay is possible). | holds (dup prompt possible) | MM-050 |
| E3 | **Every name lands in exactly one bucket with a reason** (migrate, copy, ineligible+reason, skipped-with-confirmation). One bad name never rejects the whole preview. | VERIFIED: WEB-1942 #2/#3; MM-005, MM-047. | assumed fixed (WEB-1942 Done), not re-checked | MM-005, 047 |
| E4 | **Copy only with a route**: a copy-type name is submitted only if its ancestor chain reaches a copy root that is migrated in the same plan or earlier. | VERIFIED: `classifyNames.ts` L588-607. | holds | - |
| E5 | **Unknown-label subnames are dropped only with explicit consent and a cap** (≤5), never silently. | VERIFIED: Slack (Florin 2026-11-01; Jason 2026-10-28); `subnameRecreation.ts` L724, L900 ("dropped, not lost"). Cap value in code not located → GUESS on the number. | ? | - |
| E6 | **Expiry decisions use chain time** (or fail closed): a name isn't migrated/renewed on the basis of a browser clock that disagrees with chain time. | GUESS on the fix: WEB-1978 MM-011/012/033/037 Low (Date.now(), fails closed); WEB-1946 clock flicker. | Date.now() | MM-011, 012, 033, 037 |

### F. Grace renewal
| # | Behaviour | Tag / source | main | mm |
|---|---|---|---|---|
| F1 | **Renew-before-migrate is funded and single**: grace renewal starts only with sufficient balance, and is never sent twice (another window holding the renewal blocks it). | VERIFIED: `ui` L574-580; `graceRenewalPending.ts` L136 Web Lock; Slack "Renewal already open in another window" (2026-10-30); WEB-1946 #2 (double approval via writeContract fallback). | holds after #1712? | MM-031 |

### G. Liveness
| # | Behaviour | Tag / source | main | mm |
|---|---|---|---|---|
| G1 | **Every run terminates** in `success` or `failure` (no stuck "running"), under fair wallet/RPC responses. | VERIFIED: receipt timeout 300 s (`svc` L508, L617-620); `ui` global `migration.failed`. | holds | - |
| G2 | **A dropped tx can't lock the user out forever**: indeterminate evidence eventually resolves (mined, revert, or definitively absent after a bound) and allows a retry. | VERIFIED intent: WEB-1978 ("with a timeout so a dropped tx can't lock the user out"). **Conflicts** with `fix/mm-039` ("without inventing a product timeout") → Q1. | n/a | MM-039 |
| G3 | **Retry is offered only when it can succeed** (not for plan-changed or deterministic preflight failures). | VERIFIED: `decodeMigrationError.ts` L331-332; WEB-1946 #6; PR #1728 edb4b2d99. | holds | MM-006 |
| G4 | **Progress reaches its total exactly at completion** and counts every wallet prompt (including record replay and live batch splits). | VERIFIED as a finding: WEB-1946 #5; MM-017, MM-044 (Low). | VIOLATED (Low) | MM-017, 044 |
| G5 | **Recovery is eventually completable**: from any journal state reachable without tampering, the user can reach "done" or "blocked with evidence retained", never "evidence silently gone". | GUESS (composite of C2, D2, D4, D5). | ? | MM-024 |

**Counts:** 37 behaviours. **30 VERIFIED**: A1-A7, B1-B4, C1-C4, C6, D1-D5, E1-E4, F1, G1-G4. Of these, A1, A5, D2, D3 and G4 are verified intent or findings that main is expected to *violate*. C4 is verified as a gap, but whether #1712 fixed it is unchecked. G2's intent conflicts with the mm-039 branch. **7 GUESS or part-GUESS**: A8, B5, B6, C5, E5, E6, G5. If the model needs fewer, they could be merged to about 25 (A3+A4, A6+A7, C1+C2, D4+D5, B5+B6, E3+E4, G1+G2, C6 into C2).

---

## 3. mm-001..045 → behaviour (source: WEB-1978 triage + local branches)
"branch" column: ✔ = local `fix/mm-0xx` exists; ✗ = **branch not found**; ∅ = branch exists but has no fix commit.

| MM | Summary (from WEB-1978 / branch) | Triage status | Branch | Inv. |
|---|---|---|---|---|
| 001 | Second same-scope run can start while the first is going | WEB-1942 (run lock) | ✔ unmerged | A1 |
| 002 | Retry rehydration drops batches (object identity in adjustPlanForRetry) | WEB-1942, not reachable today | ✔ unmerged | D1 |
| 003 | Direct-only plan had no recovery snapshot | Fixed #1526 | ✔ merged | A3, C2 |
| 004 | Retained manager excess roles accepted | Fixed #1529 | ✔ merged | B5 |
| 005 | Names dropped without a reason | WEB-1942 | ✗ | E3 |
| 006 | Wrong retry-blocked copy | Fixed #1531 | ✗ | G3 |
| 007 | Partial failure leaves stale queries / wrong copy | Low | ✔ unmerged | C5 |
| 008 | (needs tampered state) | Not a bug | ✗ | - |
| 009 | Excess owner roles accepted (incl. ROLE_WAS_RESERVED) | Not a bug, optional hardening | ✔ unmerged | B5 |
| 010 | Excess wrapper-root roles accepted | Not a bug, optional hardening | ✔ unmerged | B5 |
| 011 | Expiry gate uses Date.now() | Low, fails closed | ✗ | E6 |
| 012 | Expiry gate uses Date.now() | Low, fails closed | ✗ | E6 |
| 013 | Wallet submission after teardown | Fixed #1520 | ✗ (as `fix/manager-migration-teardown`) | A2 |
| 014 | Cleanup-only recovery couldn't finish | Fixed #1530 | ✗ | D4 |
| 015 | Token transferred mid-flow shown as missing permission | Low | ✗ | B1 |
| 016 | Record keys not from events | Not a bug, optional hardening | ✗ | - |
| 017 | Preview drops record-replay step from count | Low | ✗ | G4 |
| 018 | - | Not a bug | ✗ | - |
| 019 | Cross-tab journal lost update | Low | ✔ unmerged (10 commits) | D3, A1 |
| 020 | Accessibility | a11y | ✗ | out of scope |
| 021 | Accessibility | a11y | ✗ | out of scope |
| 022 | - | Not a bug | ✗ | - |
| 023 | Cleanup-only recovery (dup of 014) | Fixed #1530 | ✗ | D4 |
| 024 | Stale effect deletes newer recovery snapshot | WEB-1942 | ✔ unmerged | D2, G5 |
| 025 | /renew-v1 cache | Fixed #1531 | ✗ | out of scope |
| 026 | /renew-v1 cache | Fixed #1531 | ✗ | out of scope |
| 027 | Accessibility | a11y | ✗ | out of scope |
| 028 | Accessibility | a11y | ✗ | out of scope |
| 029 | - | Not a bug | ✗ | - |
| 030 | - | Not a bug | ✗ | - |
| 031 | Grace-default one-second race; no manager grant without opt-in | Low | ✗ | F1, B2 |
| 032 | Verification accepts uncertified parent registry | Not a bug | ✔ unmerged | B6 |
| 033 | Expiry gate uses Date.now() | Low, fails closed | ✗ | E6 |
| 034 | - | Not a bug | ✗ | - |
| 035 | Locked resolver path | Fails closed via #1522 | ✗ | B4 |
| 036 | - | Not a bug | ✗ | - |
| 037 | Expiry gate uses Date.now() | Low, fails closed | ✗ | E6 |
| 038 | - | Not a bug | ✗ | - |
| 039 | Pending tx resubmitted (receipt missing ≠ absent) | **Open Medium** | ✔ unmerged | A5, G2 |
| 040 | - | Not a bug | ✗ | - |
| 041 | Accessibility | a11y | ✗ | out of scope |
| 042 | Accessibility | a11y | ✗ | out of scope |
| 043 | Accessibility | a11y | ✗ | out of scope |
| 044 | Progress total doesn't grow on live split | Low | ✗ | G4 |
| 045 | 4xx bundle failure labelled "reverted" | Low | ∅ (0 commits) | G3 / C5 (error truth) |
| *046-050* | 046 layout (#1531); 047 orphan locked child (WEB-1942); 048/049 (MM-039 family); 050 replay prompt before intent | - | ✗ | E3, A5, A1, A3/E2 |

The "-" summaries for not-a-bug items are left blank because WEB-1978 groups them without per-item text and the original MM report pack was not found locally.

---

## 4. Open questions only David can decide
1. **MM-039 semantics (A5/G2).** Should a hash with an unavailable receipt lock the names *indefinitely* until the chain answers (the `fix/mm-039` branch, "no product timeout"), or unlock after a bound (the WEB-1978 fix direction)? This decides whether G2 is an invariant. Related: WEB-1978 asks whether MM-039 lands before or after mainnet.
2. **Baseline.** Should the model check `main` 6977db2d7 as-is (A1, A5, D2, D3 expected to fail in Current.cfg), or main plus the unmerged mm branches (001, 002, 007, 009, 010, 019, 024, 032, 039) as Hardened.cfg? Which of those branches are actually meant to land?
3. **Concurrency model (A1/D3).** WEB-1942 #1 is "Done", yet there is no execution lock on main. Is "one execution per scope across tabs" a required promise? If Web Locks are unavailable, should the flow refuse (as the mm-019 release notes say) or degrade?
4. **Threat model.** WEB-1978 dismisses 13 reports because they need tampered localStorage/XSS or impossible RPC states. Should the model treat the journal and RPC as honest but racy (as WEB-1978 does), or adversarial? This decides whether B5 (owner/root exact roles) and B6 (bound registry path) are invariants or out of scope.
5. **Temporary HCA grant across retry (A8).** May the temporary grant stay live across one retry after a user rejection (WEB-1946 #1, flagged as a security decision)?
6. **Completion definition (C4/E5).** Does "migrated/complete" include grace renewal, wrapper sync and cleanup? Is forfeiting ≤5 unknown-label subnames with consent the intended end state, and is 5 the right cap?
7. (Lower) Is the record-replay prompt opening before its intent (MM-050) acceptable, or must A3 hold for *every* wallet prompt?

---

## 5. Proposed model scope
**In:**
- the UI machine states, guards and retry (`ui`);
- the `executeMigration` orchestration and per-batch loop (`svc`);
- the journal (intents, submissions, recovery, checkpoints) with crash and reload at any step;
- reconciliation outcomes (success, revert, indeterminate, absent);
- multi-tab and multi-run interleaving per scope;
- the wallet as an actor that can sign, reject, replace a hash, or stay pending;
- abstract chain state per name (v1 owner/manager/resolver/locked, v2 roles bitmap, subregistry);
- preflight re-checks as abstract freshness predicates;
- verification as "post-state equals planned state at the receipt block";
- grace renewal as a pre-step;
- classification totality, as a separate small model or an exhaustive real-code Vitest matrix over tokenTypes × parent states (in the style of #1713's 36-combination check).

**Out:**
- Solidity/MigrationHelper internals and gas estimation (treated as atomic and correct);
- indexer correctness;
- the NFT renderer, accessibility (MM-020/021/027/028/041-043), copy text and layout;
- /renew-v1 caching (MM-025/026);
- Safe{Wallet} settlement (#1615/#1670 already have their own flows);
- price/funding (covered by #1715/#1717).

**Conventions to follow** (from #1713-#1717, see notes/fv-pr-conventions.md):
- Put the model at `apps/manager/verification/migration/` (the #1717 layout), with Model.tla, Current.cfg (expected to fail), Hardened.cfg (must pass), and one `No<Guard>.cfg` per guard that must fail its *named* invariant with TLC exit code 12.
- Pin source provenance with `verify-source-map.mjs` (SYNC_COMMIT=6977db2d7).
- Use `verify-sensitivity.sh` via mise (TLC 1.7.4 pinned).
- Add only additive, intentionally red Vitest regressions for each Current.cfg counterexample, with no production changes.
- Include a "Regression check" PR section.
- State invariants as user promises, not mirrors of code. The exploration models passed while missing the #1500 regression because `NonMemberResolverIsPreserved` mirrored the code.
