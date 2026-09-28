# Manager AI evaluation status

## Current-owner questions — 26 September 2026

The catalog now has **29 native manager-action kinds**. “Who owns pookie.eth?” proposes a read-only current-owner review. Manager validates the exact ENS name and reads its actual owner through the existing profile ownership query; Jev supplies only the bounded action choice. The review shows the current owner address without copying it. Historical 28-kind reports below describe their source snapshots.

An independent seven-case development set was frozen before provider calls. The exact reported question passed its first real TypeSafe call. Across seven first calls, **six passed**: two owner paraphrases, a missing-name clarification, and two unsupported resource/previous-owner questions also matched their labels. The mixed request “Who owns willow.eth and renew it?” was wrongly reduced to a renewal duration clarification. Its first response remains unchanged in the raw report. A whole-request guard now rejects that capture instead of dropping the owner lookup. All seven unchanged first responses passed a subsequent **offline parser replay**, with identical per-case request hashes and no new provider calls. These cases are targeted regression evidence, not general language accuracy or a signed browser verification.

First-call reports: `2026-09-26T17-24-58-053Z-owner-question-first.json` and `2026-09-26T17-25-20-084Z-owner-question-remaining-first.json`. Zero-call replay: `2026-09-26T17-29-22-260Z-owner-question-offline-replay.json`.

After the guard, `pnpm test:ai` passed **2,438 tests** (2,243 application / 66 files; 195 harness / 22 files). Manager typecheck, lint and build passed; lint retained 18 warnings and zero errors. A scan of 361 built client files found no local TypeSafe key, `TYPESAFE_API_KEY`, provider hostname or model name. The signed browser owner-question review is still unverified in this turn; the successful real call exercised interpretation and preparation only. Nothing was committed or pushed.

## Current status — compositional social requests, 26 September 2026

Production remains a **strict single-call interpreter**; neither model experiment is enabled. The catalog now includes **28 native manager-action kinds**, adding current-primary-profile navigation and exact ENS-owner-address copy review. Exact targets, fresh ownership/primary data and explicit native confirmation remain application responsibilities.

Two independent development corpora were frozen before calls: 30 compositional social/address cases and six native identity cases. Every requested clarification preserves its supplied action context in the expected outcome; all historical labels and reserved outcomes are unchanged.

| Evidence | Exact / full selected set | Incorrect ready proposals | Provider failures | Provenance |
| --- | --- | --- | --- | --- |
| First stopped run | 17/36 | 1 | 1 timeout | 28 calls; eight unattempted. |
| Completed first-attempt coverage | **22/36** | **1 retained** | **1 retained timeout** | 36 first calls across two source freezes; no retries. |
| Separate repaired composite | **23/36** | **0** | **1 retained timeout** | Only the wrong captured response replayed under the repaired parser; not 36 fresh calls or a uniform-source replay. |
| Final full parser replay | **26/36** | **0** | **1 retained timeout** | 35 stored responses parsed on final source, plus the original timeout; all 36 request hashes identical and zero calls. |

The incorrect request, “Put a star on the Bitcoin address for alderleaf.eth”, proposed favouriting the ENS name. A bounded resource-conflict repair now rejects that identical capture; its request hash is unchanged and the repair made zero provider calls. The eight previously unattempted cases scored **5/8 on their first calls**. The original wrong proposal and timeout remain in the first-attempt report. The timeout was a missing-contact-field request and was not retried.

The separate repaired composite preserves **13/26 supported-or-clarification outcomes and 10/10 rejections**. A final native grammar repair recovers current-primary navigation, owner clipboard wording and missing-owner-name clarification. The final same-request offline replay has **16/26 supported-or-clarification outcomes and 10/10 rejections**, with nine legitimate safe rejections and the original timeout remaining. Native identity results are **3/6 on first calls, 6/6 only in the final offline replay**. The original redundant primary-name question and two native rejections remain preserved. These concrete language gaps remain open; no acceptance or generalization claim follows from the aggregate. Earlier 26 captures now parse 26/26 diagnostically, but **all 26 request hashes changed** with the catalog, so that replay is not current-model evidence.

The first source was `8c1fa94ee55e43b429256a064401f5fe752cb89e191fd7cfd9fcfe29a668fda0`; the repaired completion source is `aa121f19bb647bcb39eb5baeba9f915d98d5b43698b3e03ef82892da04e088c2`. [Completion provenance](./reports/2026-09-26T13-34-27-874Z-social-composition-completion-summary.json) links the untouched first report, zero-call repair and eight first calls. Final replay source is `69368c9671afe82f69c221821a0dd07093d852563876690cc568607d4cf989fe`; [the immutable replay](./reports/2026-09-26T13-38-31-471Z-social-composition-final36-offline-replay.json) changes exactly the three native outcomes, preserving the earlier repaired resource rejection. No reserved cases were read, called or rescored, and no failed request was retried.

Final-source application checks passed **2,413 tests** (2,220 application / 66 files; 193 harness / 21 files), Manager typecheck/build and lint with zero errors and 18 warnings. All 361 built client files passed the exact local-key, variable, provider, model and experimental-marker scan; diff checking was clean, with nothing staged or unmerged.

Six completed real-provider browser checks independently verified: rejecting the Bitcoin-address star request; fronted Reddit featuring with `yoginth` preserved; Instagram unfeature/name clarification at 390 × 844 with `yogiinth` preserved; reading the connected wallet's current primary `pookie.eth` and navigating only after explicit Open; reviewing its actual owner address (`0x03Ba…17EF`); and asking for the missing ENS name before reviewing its Solana record (`7xKX…x4rH`). The Reddit feature control was checked (1/3), and Instagram remained unchecked (0/3). Copy buttons were not clicked, edits were cancelled, and no Save or signing occurred. Three additional interrupted attempts—two primary-profile and one Solana-copy—remain unobserved and are not counted as passes. Browser cleanup left no dialogs, an empty prompt with Send disabled, and the viewport restored.

[The delivery summary](./reports/social-composition-delivery-summary.json) separates the first-attempt reports, parser replays, final checks and browser evidence. Missing-primary/stale-owner/wallet-switch behavior, clipboard failure, successful V1 pricing and nonempty migration restoration/dependencies still have incomplete native coverage. Earlier evidence remains below. Nothing was committed, pushed or deployed.

## Previous social clarification status — 26 September 2026

Production uses **one TypeSafe call and the strict parser**. Conditional candidate verification and focused family-support questions remain evaluation-only; neither experiment was promoted. Manager keeps exact names, values, eligibility, pricing and native confirmation under application control. There are **26 bounded native manager-action kinds**, including opening notification settings and reviewing an exact ENS profile address for copying, alongside the existing search, registration, renewal, migration and profile families.

The latest independent development set contains 20 social-operation cases and six native-action cases, labelled before calls. It tests missing names/fields, all 11 native social fields, quoted keyword values, typos, negation and unsupported extra actions. Opt-in `interpretedAction` expectations now score the complete supplied context of a clarification, and `incorrectClarificationProposals` stops a run if a name, field, value, direction or follow-on action is changed or dropped. Historical labels and scoring remain unchanged.

| Evidence | Exact outcomes | Incorrect ready / clarification proposals | Provenance |
| --- | --- | --- | --- |
| Original stopped 26-case run | 2/26 selected; 2/7 attempted | 1 / 0 | Seven first calls; 19 unattempted when the incorrect proposal stopped the run. |
| Completed first-attempt coverage | 15/26 | 1 / 0 | Original seven plus 19 first calls across two source freezes; original error retained. |
| Repaired current hybrid | 16/26 | 0 / 0 | Six unchanged stored responses, one changed-request repair call and 19 first calls. |
| Final article-grammar parser replay | **17/26** | **0 / 0** | The same 26 captures, all request hashes identical, zero new calls. |

The original wrong proposal treated “Mark the Reddit contact … as featured” as setting its value to `featured`. The repair preserves feature as an operation and keeps explicit assigned/quoted values literal and private. The obsolete captured value reference now safely rejects; one fresh call for the changed request produced the correct feature proposal. A later bounded `a`/`an` address-copy grammar repair recovered one targeted network clarification using the identical stored response. These repairs do not replace the first-attempt score or establish a new live benchmark.

The evaluation made **27 actual provider calls** (separate from the six browser checks below): 26 first attempts and one changed-request repair, with no unchanged-request retries, provider errors or reserved calls. The latest 17/26 replay consists of **8/13 supported actions, 2/6 targeted clarifications and 7/7 unsupported requests**. Nine legitimate requests still safely reject: fronted/possessive social wording, noun-form star operations, a Telegram typo, three missing social details and a missing-name Solana-address copy. The complete-outcome gate remains unmet. Social outcomes remain 12/20; native outcomes become 5/6 only in the final parser replay. No confidence was altered to improve a score.

Final production SHA-256 is `3412a134753de6e60fb5132bf6ef803e856d0b21b7b3000ba527344b3c92b721`; the preceding hybrid snapshot is `804da2e39c7d7fe89d029df66a40df2aed8041fdc39a1724e1224f3e4f7c08aa`. The older 16-case parser replay scored 16/16 diagnostically, but **all 16 request hashes had changed** with the new catalog; it is not current-model evidence. All original raw reports, source hashes, labels and first reserved scores remain intact. [The delivery summary](./reports/social-detail-delivery-summary.json) indexes the distinct reports, including the final [26-response offline replay](./reports/2026-09-26T13-11-18-937Z-social-detail-article26-offline-replay.json).

**Native browser review:** real TypeSafe calls opened ordinary notification settings; reviewed the exact current Bitcoin address for `pookie.eth`; asked an address-network picker before the same review; asked an 11-option social-field picker and continued to GitHub; asked for a missing Farcaster name at 390 × 844 and continued to the native editor; and featured Reddit without changing its handle. GitHub `bigint`, Farcaster/Reddit `yoginth`, and the existing Bitcoin record were preserved. These six observations establish those particular native review paths, not a language accuracy sample. All were cancelled without Save, clipboard copy, preference changes, payment or wallet signing. Dialogs are closed, the prompt is blank and the viewport is restored.

**Final checks:** 2,181 offline tests passed (1,993 application tests across 63 files and 188 harness tests across 19 files); Manager typecheck/build passed; lint had zero errors and 18 warnings. The final 360-file client scan found no actual local secret, secret variable, provider host, model or experimental marker. Diff checking passed and nothing was staged or unmerged. Earlier native checks also verified 69-day registration pricing/unavailability and a notification draft that changed only the requested switch, with reload discarding it. Wallet switching during that draft, successful V1 renewal pricing, nonempty migration restoration/dependency review, clipboard failure and the remaining language misses are still open. Nothing was committed, pushed or deployed.

## Preserved experiment and verification history

## Focused family-support experiment

`focusedInterpreter.ts` is evaluation-only. It preserves the original request state, model and every original question, then appends two structured whole-request support questions for each bounded action family in **one provider call**. The candidate may use a real family support pair only for a valid, confident single-action route. Detail extraction, confidence thresholds, preparation and transaction boundaries remain under the existing parser. No fabricated confidence or default answer fills a missing response.

`focusedRunner.ts` compares the production parser applied to original answers from that augmented response with the experimental family-support interpretation. This is **paired evidence from one capture**, not a separate production benchmark. The runner checks unchanged private state and original question objects before sending, checks additional questions against the static experimental definitions, and records every question hash, original/augmented request size, raw response, selected support provenance, exact prepared outcomes, provider failure and wrong proposal. Shared provider latency, local parse times and total paired evaluation time are recorded separately; a standalone production network latency or cost cannot be inferred from this design.

`focusedCorpus.ts` contains 60 independent cases: 40 development and 20 reserved, split by whole linguistic construction/scenario groups. It includes 39 supported requests, seven clarifications and 14 rejections. Labels were frozen before provider calls at corpus SHA-256 `35e6c0055512c264bfaaf61000d3ec850892ae8739f173582233ac37915052db`; the manifest is `focusedCorpus.freeze.json`. A pre-call privacy audit exposed one reserved scenario, `focused-contrasted-resource-role-1`, to repair a supplied-value redaction defect. Its label remains unchanged, and its eventual score is reported separately from the 19 untouched reserved cases. Provider evaluation waits for the privacy check to pass on all 60 cases.

Live execution is opt-in and defaults to development. Freeze production source and the experimental implementation/harness before a measured run. The harness stops subsequent cases after a wrong proposal or provider access/rate-limit denial and preserves completed responses and unattempted rows. It never retries or executes an action.

```sh
AI_EVAL_FOCUSED_LIVE=1 AI_EVAL_SPLIT=development AI_EVAL_ENFORCE=1 \
  pnpm exec vitest run --config vitest.ai-eval.config.ts evals/ai/focused.eval.ts
```

The original candidate-verification experiment and all earlier results remain below, unchanged.

### First focused-support development outcome

**The focused-support candidate was not promoted.** The first run stopped after 36 of the 40 development cases when both interpretations proposed the wrong action. The immutable report is `reports/2026-09-26T11-42-19-133Z-focused-development-1.json`; source SHA-256 is `12050a84cec2b0e5513e22e03621e2cb77368622b9c7aa6124761f038ccdbf06`, candidate SHA-256 is `ba5165b7e313b8bc2b38d3acb7f5dbabc8b741fb013e35405b179f32b05196dd`, and harness/scoring hash is `595562f8610fe83c47e044c2719547b0673df0bc0d128478d72a811c5e55bc67`. No source drift occurred.

| Interpretation of the same captures | Exact / full selected set | Incorrect proposals | Unattempted |
| --- | --- | --- | --- |
| Production parser on original answers | 35/40 | 1 | 4 |
| Experimental family-support parser | 30/40 | 1 | 4 |

Among 36 completed pairs, the experiment had **zero recoveries and five losses**. Its family support questions rejected an exact GitHub replacement, a combined V1/manager/18-day expiry filter, a two-name 90-day renewal, registration with a missing name, and GitHub editing with a missing value. The original answers produced the correct actions or targeted clarifications. These are failures of the proposed replacement evidence, not failures to extract those details. The five losses and their actual evidence are preserved in `reports/focused-development-1-diagnostics.json`; no confidence was changed to improve a score.

The stopping case, “unstar the twiter account for bluefern.eth”, should unfeature its Twitter contact. Both interpretations instead proposed removing the ENS name from favourites. That is counted as an incorrect mutation proposal even though the harness executed nothing. The wrong intent and native action were both scored 0.99, while a competing unfeature operation was 0.95. Strong model confidence did not establish the correct resource or operation. The remaining four development cases and all 20 reserved cases were left uncalled at this stage; the original 40-case denominator and failure are preserved.

There were **36 actual provider calls**, zero provider failures and zero harness failures. The request kept 38 original questions and added 34 experimental questions. One representative payload grew from 60,165 to 120,307 bytes. Shared provider latency averaged 548.8 ms, with p95 612 ms; total paired evaluation averaged 559.5 ms. These are local observations of the augmented request, not a comparison with separately measured production latency or a cost estimate. Every original question and private state matched its original-builder hash. Production continues to use the existing single-call parser, and no focused questions were tuned after this failed experiment.

### Separate production repair and bounded completion

The shared social-operation defect was repaired in production code, independently of the failed focused-support idea. Profile-field feature/unfeature requests retain their resource and operation, preventing a social-contact request from becoming a name favourite change. The frozen final source is `19d94b42c5323596f1adb74a869322f99499af1a03f8dfad3575c0d59e9a1d4e`.

The five-case completion scored **5/5** with zero incorrect proposals, errors or unattempted cases. The failed Twitter case reused its captured original answers because the request hash matched exactly; it now prepares Twitter `unfeature`. The four cases skipped by the first run made their **first provider calls**, correctly preparing 12-day renewal, profile sharing, 42-day registration and the exact supplied GitHub handle. This is **one stored-response repair plus four first calls**, not five new calls or a rerun of all 40 cases. The immutable result is `2026-09-26T11-53-41-241Z-focused-production-repair-and-first-attempts.json`, indexed by `reports/focused-production-repair-completion-summary.json`.

An independent offline replay of the previous 706 regression and 45 development captures retained **681/706 plus 43/45 (724/751)**, with identical request hashes, zero changed outcomes, zero wrong proposals and zero provider calls. See `2026-09-26T11-53-47-071Z-social-production-old751-replay.json`. This regression excludes the earlier family reserved 12, renewal reserved 15 and new focused reserved 20. Those first scores or uncalled status remain untouched. The focused experiment used 36 calls and its production completion used four more; no failed request was retried.

**Live browser reliability remains unresolved.** On the repaired source, real requests `unstar the twiter account for pookie.eth` and `Star the Twitter account on pookie.eth` both rejected without reaching native profile review. Neither proposed the wrong unfavourite action. A correct stored-response repair does not establish acceptance of a new model response, and the five-case result must not hide these browser failures. Earlier real GitHub-unfeature and value-first replacement checks did reach the native editor and were cancelled without saving.

Final application checks passed **1,777 offline tests**: 1,614 application tests and 163 evaluation-harness tests. Manager typecheck/build passed, lint had zero errors and 18 warnings, diff checking was clean and no changes were staged. All 360 built client files were scanned with zero matches for the actual local TypeSafe key, secret variable name, provider hostname, model name or experimental question marker. Browser checks also retained an invalid target date before the selected names' current expiry without substituting pricing or a default duration. Successful V1 renewal pricing remains unverified after the live registration lookup failed. No Save, payment, record/notification mutation or wallet signing occurred; dialogs are closed and the prompt is empty. Nothing was committed, pushed or deployed. `reports/focused-delivery-summary.json` indexes the final evidence and limitations.

### Social-field abstention repair and current native checks

Two subsequent fresh production-style diagnostics preserved the actual Twitter browser failures as **0/2**: both identified feature/unfeature correctly but returned `profile_field: none`. These are immutable captures in `reports/2026-09-26T11-59-02-920Z-browser-twitter-two-fresh-production-diagnostics.json`. The strict resource guard prevented an ENS-name favourite action, but it also rejected an otherwise complete social-contact request. The bounded repair resolves only this valid field abstention from a complete literal social operation, a known native social field and matching confident operation evidence. Contradictory, unknown, malformed or missing field evidence still rejects; the model questions and global confidence thresholds are unchanged.

Current frozen source is `13aa279c0f1f88c3de0660819923a1aa471277a9e1522f197254823cb06b5c57`. Replaying those two responses and the original wrong-action response scored **3/3**, with all three request hashes matching and **zero provider calls**. A separately authored, fixed-label 12-case development corpus covers all 11 social fields, missing-name clarification, negation, an unsupported follower condition and ENS-name unfavourite as a resource contrast. Its first live run scored **11/12** with **12 calls**, zero incorrect proposals, zero provider errors and no retries or source drift. The complete-results gate intentionally failed. The sole miss, “Unpin the Telegram account for wisteria.eth”, safely rejected with main intent `edit_profile` at 0.49, below the unchanged 0.55 threshold; field `telegram` was 0.53 and operation `unfeature` was 0.74. This miss remains open and was not retried or relabelled. The corpus hash is `d1cb171f5b8754e7a69c82348cd7000ffdfaa2e36fda7d25dcbc277b24dfff6c`.

The distinct raw artifacts are `reports/2026-09-26T12-08-27-822Z-social-none-captured3-replay.json` and `reports/2026-09-26T12-08-27-823Z-social-none-first12-contrasts.json`; `reports/social-none-delivery-summary.json` indexes this round. The new set is development evidence, not reserved generalization. No reserved cases or old 751-case regression were rerun in this round, and all prior raw failures, replay scores and first reserved scores remain unchanged. Neither experimental interpreter is enabled in the production server.

**Both original Twitter prompts then passed real browser checks on the current source.** “unstar the twiter account for pookie.eth” opened native Contact with Twitter `yoginth` preserved, its feature checkbox unchecked and Save disabled because it was already unfeatured. “Star the Twitter account on pookie.eth” preserved the same handle, checked its feature checkbox and enabled Save. Both were cancelled. This resolves those exact browser acceptance gaps; it does not erase their earlier failures or establish universal social-language accuracy.

The same source separately preserves explicit “all eligible” migration scope through `allEligible: true` and the native `eligible-all` preset. The real request “Upgrade all eligible V1 names” reached `/migration?preset=eligible-all`. The connected wallet had **0/0 eligible names**, so the empty state and disabled action were verified; a nonempty selection including names requiring manager restoration remains covered by offline tests, not a live browser result. Existing exclusion requests retain their separate subset preset.

Final checks passed **1,843 offline tests** (1,678 application and 165 harness), Manager typecheck/build, and lint with zero errors and 18 warnings. A test-fixture typing repair after the snapshot did not change production source. The 360-file client scan was clean; diff checking passed and nothing was staged. Browser dialogs are closed and the prompt is empty. No Save, upgrade, payment, notification/record write or wallet signing occurred. Nothing was committed, pushed or deployed. Remaining gaps include the Telegram confidence rejection, successful V1 pricing and nonempty migration restoration/dependency review.

### Social intent proof and value-role follow-up

The original social first-call result remains **11/12**. A bounded production change allows a valid raw `edit_profile` choice below the main-intent threshold only when the existing complete social-operation proof establishes the requested native field and operation; other action families and guards retain their thresholds. Exact replay of the three earlier captures plus the original 12 contrasts scored **15/15**, with identical request hashes and zero calls, on source `0e871623689267379178e631f0d0ea31b39440002991e467ee348b46ad1e0d09`. This recovers the captured Telegram request; it is a parser replay, not a new 12-case model benchmark. See `reports/2026-09-26T12-18-18-145Z-social-main-captured15-replay.json`.

`socialIntentCorpus.ts` adds 16 independently authored development contrasts, frozen before responses at SHA-256 `ca2a5992c2590fcaa946cadd5c7d3d0a410f6b69f7003c639592cae451a4e1c0`: eight supported actions, two targeted clarifications and six unsupported requests. The first run exposed another incorrect proposal. “Set the GitHub contact on cinquefoil.eth as featured” proposed replacing its GitHub handle with `featured`, rather than featuring the existing contact. Its main intent was already confident, so this was a separate operation/value-role defect. The run stopped after the four in-flight calls completed: **1/4 attempted outcomes passed, one was incorrect, and 12 were unattempted**. The full selected-set result remains **1/16** in `reports/2026-09-26T12-18-40-682Z-social-main-first16-contrasts.json`. No action was executed and no label was changed.

The repair keeps “as featured” visible as an operation while retaining explicit assigned or quoted usernames as private values. Frozen interpreter source `8f05733f2f7baecb57a66d74bad1eec17e94dd0abcd5eea98b4718ceda8c18ba` changed **exactly one of those four outgoing request hashes**. Replaying the old wrong GitHub response now safely rejects its obsolete value reference; that rejection is not counted as an exact feature result. The other three captured requests retained their hashes. One fresh call for the changed GitHub request correctly prepared feature with an empty value, and the 12 unattempted cases received their first calls.

The bounded live completion scored **10/13**, with zero incorrect proposals, provider errors or retries. Combining it with the three unchanged stored responses gives **11/16** current outcomes: five of eight supported actions, zero of two clarifications, and all six rejections. This is hybrid evidence, not 16 fresh calls. The five misses safely rejected possessive Discord wording, an Instagram typo, noun-form Reddit pin removal, Farcaster with a missing name and a contact with a missing field. They were not retried or repaired in this round, and the full-success gate remains failed. No reserved case was called or rescored. Raw responses and exact provenance are indexed by `reports/2026-09-26T12-27-50-847Z-social-state-completion-summary.json`; the evaluation snapshot is distinct from later native notification changes.

Real TypeSafe browser checks then opened the native Contact editor for “Set the GitHub contact on pookie.eth as featured”, preserving GitHub `bigint` while checking the feature box and enabling Save. “Unpin the Telegram account for pookie.eth” preserved Telegram `yoginth`, left its feature box unchecked and disabled Save because it was already unfeatured. Both were cancelled. A separate 69-day registration request reached the native registration route with `durationDays=69`, a 4 December 2026 expiry, a nine-week/six-day duration and loaded pricing ($1.51 in that local snapshot). No Save or payment was submitted. These are native review observations, not completed transactions or evidence that all new language variants succeed.

Final application source is `1c0cfb8c683cfc97a1bf3ef84a71d784a9a4357423e2c1494cd53432acb59e4b`. Its only production-source difference from the evaluation snapshot is `features/notifications/settings/preferences.tsx`; request construction, interpretation and preparation files are unchanged. The explicit interpreter subset fingerprint is identical at `ebc1efad98116f93599e2c71eed343abd6a03f484d1bdd300235200364bbc5d8`. This native notification change does not turn the hybrid evaluation into a new full-app model run.

Further real-provider browser checks handled an unavailable 69-day registration request with “pookie.eth is unavailable for registration” while staying on `/ai`. Turning off favourite expiry reminders opened a native draft with Favourites false while Name Expiry and ENS Updates stayed true. Save was disabled because there was no verified notification channel. Reload explicitly discarded the stale draft and restored all three backend settings to true, confirming that nothing had been saved. A wallet switch during this flow remains covered offline only; the reload check is not a substitute for that native scenario.

Final verification passed **1,986 tests**: 1,818 application tests across 58 files and 168 harness tests across 17 files. Manager typecheck/build passed; lint had zero errors and 18 warnings. All 360 built client files passed the exact local-key, secret-variable, provider and model scan. Browser review returned to `/ai` after discarding the draft. No Save, record/notification change, payment or wallet signature occurred, and nothing was committed or pushed. `reports/social-intent-delivery-summary.json` preserves source fingerprints, immutable report references, current hybrid counts, five remaining safe rejections and the browser/offline coverage distinction.

## Conditional candidate verification

**Candidate verification is experimental and is not enabled in the live server function.** `interpretAiAction.ts` uses the single-call `parseJevAiResponse` parser. The extra resolver, confirmation UI support and evaluation harness remain available for experiments; measured results below did not justify enabling an extra production call. No feature flag was added.

The runner now defaults to the single-call parser used by the live server function. Set `AI_EVAL_CANDIDATE_VERIFICATION=1` to opt into the experimental shared `interpretAiModelResponse` resolver after each initial `/ai` response. That resolver alone decides whether a schema-valid interpretation blocked only by low main-intent confidence qualifies for one follow-up verification call. The harness does not change confidence, retry a failed request, execute an action, or make a second call for dashboard searches. `interpretationMode` explicitly records the chosen pipeline. Its `baselineSummary` always measures the first-stage behavior; its final summary measures the selected pipeline. Historical experimental reports retain their original metadata and results.

New reports retain the initial-only `baselineSummary` and each case's `baseline`, alongside the final `summary`. Per-case `calls` preserve each initial and verification response, request SHA-256, provider latency and sanitized error reason. The `verification` summary records actual provider-call counts, attempted verification cases, recovered/lost exact outcomes, accepted/rejected candidates, and latency distributions for initial calls, verification calls and total cases. Initial-call latency measures the provider request and JSON read; total-case latency also includes interpretation and preparation. Historical single-call reports remain unchanged.

`needs_confirmation` is a separate observed outcome containing the proposed action and its prepared outcome. It does **not** count as a successful ready action, and corpus expectations are unchanged. A confirmation that proposes the wrong full outcome is counted separately as `incorrectConfirmationProposals`; enforced evaluation requires zero such proposals. A matching confirmation is reported separately, not silently accepted on the user's behalf. Provider failure during verification remains an infrastructure failure and still aborts later batches on authentication or rate-limit denial.

`candidateCorpus.ts` adds **40 independently authored challenges**: two supported requests for each of 11 AI families, two dashboard controls, six targeted clarifications and ten rejection requests. Thirteen requests contain typos. The fixed split is 32 development / eight reserved; the smoke set includes development cases only. These labels were authored before any provider outcome for this pass. Natural-language cases are not forced to trigger a verification call; trigger frequency and actual benefit are measured separately.

```sh
AI_EVAL_CORPUS=candidate AI_EVAL_SPLIT=development AI_EVAL_CANDIDATE_VERIFICATION=1 pnpm eval:ai
AI_EVAL_CORPUS=candidate AI_EVAL_SPLIT=heldout AI_EVAL_CANDIDATE_VERIFICATION=1 AI_EVAL_ENFORCE=1 pnpm eval:ai
```

### First candidate-verification results (2026-09-26)

Frozen source SHA-256: `985882beb97a911f9f6cf9e2e5a57138c58ee118eb65e353d47aa9810dd978c7`. The independently authored 40-case challenge and existing 630-case regression yielded **no measured accuracy gain or loss**:

| Evaluation | Initial-only exact | Final exact | Actual provider work |
| --- | --- | --- | --- |
| New development | 29/32 | 29/32 | 32 initial calls, zero follow-ups |
| New first reserved | 6/8 | 6/8 | Eight initial calls, zero follow-ups |
| Existing regression, stored initial responses | 592/630 | 592/630 | Zero initial calls, three follow-ups |

There were **43 actual provider calls**, comprising 40 new initial calls and three conditional verifications. The 630 initial responses were reused from immutable reports; their initial request hashes matched the current builders. All three eligible candidates were rejected by the verifier. No candidate reached confirmation in these observed runs. There were zero incorrect ready proposals, zero incorrect confirmation proposals, zero provider failures and no source drift. Existing corpus expectations were unchanged.

Initial-call latency across the 40 new requests averaged **503 ms**, with a median of **420 ms** and p95 of **967 ms**. The three verification calls averaged **361 ms**, with median **368 ms** and p95 **389 ms**. These are small local samples; the stored regression's processing latency excludes its historical initial-call network time and is not an end-to-end latency measurement. The new 40 had no verification overhead because none qualified for the narrow main-intent recovery path.

Reports are `2026-09-26T09-18-10-801Z-candidate-first-development.json`, `2026-09-26T09-19-17-359Z-candidate-first-reserved.json`, and `2026-09-26T09-19-48-371Z-candidate-630-stored-baseline-followup.json`. The aggregate artifact is `reports/candidate-verification-first-summary.json`. The first reserved result remains **6/8**; its outcomes were not used to tune this pass. Later use of these 40 cases is regression coverage.

Both enforced new-challenge commands failed unmet accuracy gates. The stored-response run passed its provider-integrity and zero-incorrect-proposal checks; it did not claim that the previously unmet accuracy gates were achieved. All **68 offline harness tests** passed, including conditional-call accounting, confirmation scoring and stored-response provenance. The implementation is testable and bounded, but this first measurement does not demonstrate an improvement in user-request success. Existing 630-case labels and every earlier raw report are preserved.

# Manager AI evaluations

This is a synthetic, independently labelled end-to-end interpretation corpus. It runs the **production request builder → Jev → production response parser → handoff preparation**, without opening routes, looking up a wallet, changing records, or invoking transactions. It does not evaluate pricing, on-chain eligibility, browser layout, or completed wallet actions; those need the app's existing tests and manual browser verification.

### Native semantics and redaction follow-up

The first zero-gain result was retained. Exact reconstruction of the three verifier request hashes found that the uppercase primary-name request had lost the word `primary` during profile-value redaction: the provider saw `Set [ENS_NAME] as [PROFILE_VALUE_1]`. Its name reference itself was correct. The redaction repair now preserves the operation word, and the verification payload separately includes a static description of the native operation. No confidence threshold changed.

Frozen follow-up source: `4b43f5b1afb566c3883656d96e297464ce8959bedb681a55eda9741098c4dd2a`. Per-case request hashes identified **exactly one changed initial request**, `set_primary-7`. That initial call was recaptured live; every unchanged initial response was reused. The explicit hybrid mode rejects incomplete replay sets unless the missing cases are individually designated for fresh initial calls.

| Follow-up evidence | Initial-only exact | Final exact | Actual provider work |
| --- | --- | --- | --- |
| Existing 630regression | 593/630 | 593/630 | One changed initial request and two verification calls; 629stored initial responses |
| New 40challenge, now regression | 35/40 | 35/40 | Zero calls; 40stored initial responses |

The **one recovered outcome came from the initial redaction repair**, before candidate verification. Verification itself recovered zero outcomes and lost zero. The remaining two candidates both had matching verifier choices, but their details/coverage confidence remained below the unchanged acceptance thresholds. They rejected. There were zero incorrect ready proposals, zero incorrect confirmation proposals, zero provider errors and no source drift. The first reserved challenge score remains **6/8**. Its outcomes were not used to tune this follow-up.

This follow-up used **three actual provider calls**, with 669stored initial responses across 670 cases; it was not a 670-case fresh live run. The changed primary request took 422 ms; the two verification calls averaged 355 ms (347 ms and 362 ms). Sample sizes are too small for performance claims. Current artifacts are `reports/candidate-verification-current-summary.json`, `2026-09-26T09-26-25-148Z-candidate-regression630-semantics-hybrid.json` and `2026-09-26T09-26-26-770Z-candidate-challenge40-semantics-hybrid.json`. Original zero-gain and first reserved reports remain immutable. The bounded implementation is covered, but these measurements still do not establish a success-rate benefit from the conditional verification pass.

Application verification at that stage passed **1,219 offline tests**: 1,150 application tests and 69 harness tests. Manager typecheck/build passed; lint had zero errors and 13 warnings; `git diff --check` passed. The 360-file client scan found no actual TypeSafe secret, secret key name, provider host or model name.

Real authenticated browser requests verified a misspelled GitHub feature request in the existing profile editor and the uppercase primary-name request in the existing selector; both were cancelled. The primary submit button was disabled because the name was already primary. The separate `needs_confirmation` UI was exercised at desktop and 390 px using a temporary local server-response fixture: accepting the proposed interpretation led to ordinary action review without automatically handing off an action. That fixture was removed, the page reloaded, and the viewport reset. This confirmation UI check was mocked; no observed live evaluation reached that branch. No saves, notification changes or wallet signing occurred.

### Boolean verifier conformance and final replay

The final verifier asks three self-contained yes/no questions using TypeSafe's `noul` probability response: whether the operation matches, whether its details match, and whether it covers the whole request. All three probabilities must be at least 0.9 for acceptance. Operation probability from 0.5 up to 0.9 can ask for confirmation only when details and coverage are both at least 0.9. Malformed or out-of-range responses reject. The initial interpretation thresholds and corpus labels are unchanged. Historical choice-response reports above are preserved as measurements of their earlier implementation.

`candidateVerificationCorpus.ts` contains **24 independently authored direct contrasts**, with 12 correct candidates and 12 incorrect candidates. These measure the second-stage judgment alone, not first-stage interpretation or end-to-end action success. Wrong candidates preserve real query spans so all 24 reach the provider; a local projection refusal cannot inflate rejection accuracy. The corpus was authored before its first verifier result, and no label was changed afterward. `verification.eval.ts` is opt-in, saves raw responses and redacted request hashes, and reports provider errors and unattempted cases separately.

Final frozen source SHA-256: `6487941fd5ca9e41287c85a060cf4bc21a0d3dffeb32834bf69a562b59adb280`.

| Final evidence | Result | Actual provider work |
| --- | --- | --- |
| Direct verifier contrasts, first outcome | 15/24 exact: four correct candidates accepted and 11 incorrect candidates rejected | 24 calls; one incorrect-candidate case returned HTTP 520 |
| Existing 630 end-to-end regressions | Initial 593/630; final 593/630 | 630 stored initial responses and two conditional calls |
| Existing 40 challenge regressions | Initial 35/40; final 35/40 | 40 stored initial responses; zero calls |

The direct contrasts accepted **zero incorrect candidates**, proposed zero confirmations, and rejected eight correct candidates. The remaining incorrect-candidate case is a provider failure, not a successful rejection. There was no retry. The direct-conformance command failed its provider-completeness and exact-outcome goals; it does not establish complete verifier reliability.

All 670 end-to-end initial request hashes matched the stored captures, including the previously recaptured primary-name request. There were **zero fresh initial calls**. Both eligible rejected candidates remained rejected after verification, so the measured verifier delta is **zero recovered and zero lost outcomes**, with zero incorrect ready proposals, zero incorrect confirmation proposals and zero provider errors in this replay. The two verification calls took 395 ms and 579 ms, averaging 487 ms. Historical first-call network time is excluded from replay processing latency. The first reserved challenge outcome remains **6/8**; later replay is regression evidence.

The combined final pass made **26 actual provider calls**, not 694 new end-to-end requests. Its artifacts are `2026-09-26T09-33-53-500Z-verification-conformance.json`, `2026-09-26T09-34-36-003Z-candidate-regression630-noul-replay.json`, `2026-09-26T09-34-37-463Z-candidate-challenge40-noul-replay.json`, and `reports/candidate-verification-noul-summary.json`. Every earlier report remains unchanged. Neither the old choice verifier nor this Boolean verifier demonstrated an end-to-end success-rate gain on the measured eligible requests. The separately measured one-case improvement belongs to the initial redaction repair.

After these results, only the production server wiring changed: `interpretAiAction.ts` now uses `parseJevAiResponse`, leaving conditional verification disabled. The independently tested first-stage redaction and session safeguards remain. A source comparison confirmed that this is the sole production-file delta from the measured snapshot; `reports/candidate-verification-production-wiring-decision.json` records both hashes and the decision. No provider run was repeated for that wiring change. The stored first-stage evidence for the active parser is **593/630 plus 35/40**; those counts are reused-response evidence, not a fresh live-production benchmark. Experimental reports and the HTTP 520 failure remain unchanged.

Offline verification at that stage passed **1,245 tests**: 1,150 application tests plus 95 harness tests, including 26 contrast-corpus projection/privacy checks. Manager typecheck and build passed; lint had zero errors and 13 warnings. The final 360-file client scan found no actual TypeSafe secret, secret variable name, provider host or model name. Browser verification is described above, with the confirmation fixture explicitly distinguished from real provider behavior. Nothing was committed, pushed or deployed.

## Commands

### Focused family coverage

`familyCorpus.ts` adds 48 independent requests: 16 each for migration exclusions, profile operation/resource/value roles, and combined name filters. There are 31 supported outcomes, five targeted clarifications, 12 unsupported requests, and four typo cases. Every fourth case is reserved, yielding 36 development and 12 reserved cases; the nine smoke cases are development only. Labels were frozen before any provider calls at corpus SHA-256 `c4a9ae4ea3c0ffc0cdcf532bae02d6671220b766339f74996016bae414031c42`. No earlier expected label changed.

The focused evaluation compares already exposed family failures and then the new development split. Reserved outcomes were kept uninspected until the final source freeze. `prepareInitialReplay` compares each current first-request SHA-256 with its captured request: unchanged requests reuse the immutable initial response and original provenance; changed or previously unavailable first requests are explicitly recaptured once. Missing or duplicate captured cases are errors. Reports separate stored evidence, actual provider calls and production versus experimental interpretation mode.

The first frozen source, `9c42b113f977c7d5912d48314416b6a961a6ba7a08cb6015a74c2244a8bc071b`, recovered **11/25** previously failing focused requests: six of six migration cases and five of five profile cases. The remaining four name searches, eight bulk renewals and two dashboard searches rejected. Twenty-three changed initial requests were recaptured once and two unchanged dashboard responses reused. This is a selected failure comparison, not a new full 630-case score.

The independent development set's first outcome was **22/36**: ten of 22 supported requests, three of five targeted clarifications, and nine of nine unsupported requests. There were zero incorrect proposals, zero provider failures and no source drift across both runs. The strict single-call parser made **59 actual provider calls**, with no conditional verification. The enforced development command failed its support and clarification gates. Twelve reserved cases remain uncalled at this stage. Original first outcomes are saved at `2026-09-26T09-55-45-180Z-family-development-1-exposed.json`, `2026-09-26T09-55-54-608Z-family-development-1-new36.json`, and `reports/family-development-1-summary.json`; no expectation was changed to make a rejection pass.

The second frozen source, `efd87c755d943a3510b5a9cc097952f6cdb1262e154c9cfe443601ada214cc0a`, scored **16/25** on the same exposed subset and **33/36** on development. All 12 migration and all 12 profile development cases passed. Collection misses remained: two supported requests rejected and one missing renewal unit failed to clarify. Development canonical/paraphrased support was 17/18, typo support 3/4, clarification 4/5 and unsupported rejection 9/9; the enforced command still failed its language gates. This pass used 59 fresh initial calls plus two unchanged stored responses. Reports `2026-09-26T10-08-02-335Z-family-development-2-exposed.json` and `2026-09-26T10-08-06-901Z-family-development-2-new36.json` preserve the exact outcomes.

The first reserved run then scored **8/12**, with zero incorrect proposals or provider errors. Migration passed 4/4, profile 2/4 and collection requests 2/4. Its four safe failures concern existing Ethereum-address reuse for another network and combined exclusion/sort filters. These outcomes were not used to tune this source. `2026-09-26T10-10-13-345Z-family-first-reserved12.json` remains the first untuned reserved result; development and reserved together were 41/48 on that snapshot.

The subsequent existing 670-case regression scored **633/670** exact outcomes, versus the earlier 628/670. It reused 79 initial responses with identical request hashes, including the latest development captures, and called 591 changed initial requests once each. All reports retain the original capture provenance. There were zero incorrect proposals, one timeout (`candidate-4`), no unattempted cases, no conditional-verifier calls and no source drift. The timeout remains an infrastructure failure; it was not retried or removed from the full 670-case denominator. Original 630-case coverage scored 599/630 (previously 593/630), while the 40-case challenge scored 34/40 (previously 35/40), with its sole new loss caused by that timeout. The raw command failed provider completeness, and the language acceptance gates also remained unmet.

| Family in the existing regression | Previous exact | Raw current exact |
| --- | --- | --- |
| Migration | 32/38 | 38/38 |
| Profile editing | 117/123 | 122/123 |
| Collection search | 30/34 | 30/34 |
| Bulk renewal | 32/42 | 29/42 |
| Primary name | 30/31 | 29/31 |
| Favourite | 29/29 | 28/29 |
| Native Manager actions | 89/95 | 89/95 |
| Registration | 33/33 | 32/33, one timeout |
| My Names dashboard | 53/56 | 53/56 |

There were **17 gains and 12 losses**: 11 previously successful requests safely rejected, and one timed out. All semantic losses received fresh model responses, so the aggregate change must not be attributed entirely to deterministic code improvement. A separate offline counterfactual replay found that five bulk-renewal losses also rejected their previously successful response bodies on the new parser. That isolates a deterministic duration/window gate regression; the other six semantic losses still accepted their old bodies and therefore depend on changed model responses. The old and new requests differ, so this does not isolate model randomness from instruction changes. Those diagnostic substitutions are not scored model outcomes.

The immutable raw report is `2026-09-26T10-10-19-807Z-family-final670-regression.json`, with comparison `reports/family-final670-comparison.json`. The parser diagnostics are `reports/family-final-loss-counterfactual-diagnostic.json` and `reports/family-final-loss-window-ablation.json`. The raw 633/670 result, first reserved 8/12 result, timeout and all expected labels remain preserved.

#### Final parser repair and verification

The final parser source is `8120e6cb4078668a5038c4227bb8d532fc6982e63d6686e8c1f35d33f958bd0b`. Added renewal time can make an expiry-window answer inapplicable only when Manager has validated a positive duration and completely understood the remaining selection, with every raw model facet agreeing and expiry set to `any`. Malformed answers, unsupported selection clauses and actual expiry cutoffs still reject. Exact names such as `soon.eth`, `expiry.eth` and `selected.eth` cannot become expiry filters or previous-selection references. The separate exception for uncertain general support retains its stricter raw-window agreement. No confidence threshold was lowered and no corpus label changed.

A final **706-case offline replay** used the immutable 670 regression responses and 36 development responses. Every first-request hash matched; there were **zero provider calls or retries**. The 12 newly reserved responses were deliberately not rescored. The intermediate parser replay at source `542bc4a4e1068dbfca323eea9543c0b460e7bf107a4c15eb1287de8037107962` remains a separate historical artifact.

| Evidence | Exact outcomes | Incorrect proposals | Provider failures |
| --- | --- | --- | --- |
| Original final hybrid regression, preserved | 633/670 | 0 | One timeout |
| Final parser replay of those same captures | **639/670** | **0** | Same historical timeout carried forward |
| Final parser replay of family development | **33/36** | **0** | 0 |
| First family reserved outcome, not rescored | **8/12** | **0** | 0 |

Six bulk requests changed from rejection to the exact intended review: V2 names for 84 days; owned names for three years; favourite V1 names excluding primary names for two years; the previous selected names for 84 days; managed names for 90 days; and non-primary V2 names for 63 days. No other outcome changed. Bulk renewal now scores 35/42 on the replay, compared with 29/42 in the raw hybrid run and 32/42 in the earlier baseline. The current replay is 605/630 plus 34/40; **639/670 is stored-response parser evidence, not a new live-model accuracy measurement**.

Canonical/paraphrased support is 377/392 (96.17%), typo support is 67/79 including the timeout (67/78 evaluated), targeted clarification is 83/84, and unsupported rejection is 112/115. The typo, clarification, rejection and provider-completeness goals remain unmet. The new development set still has two safe support failures and one missing-unit clarification failure. The original reserved failures remain visible and were not used to tune the repair. No incorrect ready proposal was observed in these final evidence sets; that is not a guarantee for arbitrary requests.

The final artifacts are `2026-09-26T10-29-15-976Z-family-final-parser-replay-regression670.json`, `2026-09-26T10-29-15-976Z-family-final-parser-replay-development36.json` and `reports/family-final-parser-replay-summary.json`. `reports/family-delivery-summary.json` records the raw and replay scores, source hashes, zero-call accounting and final verification together. All first outcomes and intermediate reports remain unchanged.

Final application verification passed **1,509 offline tests**: 1,406 application tests across 49 files and 103 harness tests across 11 files. Manager typecheck/build passed; lint had zero errors and 14 warnings; `git diff --check` passed. A scan of 360 client files found no actual local TypeSafe key, `TYPESAFE_API_KEY`, provider hostname or model name. Nothing was staged, committed, pushed or deployed.

Real authenticated browser calls reached the native Links editor for an explicit GitHub URL and for a polite missing-URL request completed with `https://yoginth.com`. Existing Ethereum-address reuse opened Addresses with Polygon selected; Save was disabled because it already used that address. The migration exclusion review navigated to `/migration?preset=eligible-no-manager-restoration`, but the wallet had zero eligible names, so a nonempty subset and parent/subname dependency handling remain unverified in the browser. At 390 × 844, the grace-name result showed two real V1 names with correct “1–2 of 2” pagination and no clipping.

A final real TypeSafe request, `Renew my V2 names for 84 days`, matched 578 currently renewable names and opened the native 84-day review. Its displayed expiry moved from 15 December to 9 March and pricing loaded ($1,064.16 in that local snapshot). The review was cancelled before Next. This verifies the proposed duration and native pricing handoff; the price is not a performance measurement or a transaction result. No saves, notification writes or wallet signatures occurred. The prompt was cleared, dialogs closed and viewport restored.

The most useful remaining work is distinguishing added time, expiry windows and expiry ordering in less direct language; asking for missing units and rejecting conflicting explicit durations; improving typo interpretation without relaxing intent safety; and independently checking remaining profile source/destination wording. Nonempty migration subset/dependency review still needs browser evidence. Candidate verification remains disabled in the production server.

```sh
AI_EVAL_CORPUS=family AI_EVAL_SPLIT=development AI_EVAL_ENFORCE=1 pnpm eval:ai
AI_EVAL_CORPUS=family AI_EVAL_SPLIT=heldout AI_EVAL_ENFORCE=1 pnpm eval:ai
```

### Renewal time and profile role challenge

`renewalCorpus.ts` adds **60 independently authored requests**, with 20 each for renewal time roles, shared target expiry dates and profile source/destination wording. The fixed split is 45 development and 15 reserved, with every fourth row reserved and nine development-only smoke cases. There are 35 supported outcomes, eight targeted clarifications, 17 unsupported contrasts and eight typo cases. The corpus has no exact query duplicates among the previous 718 cases. Expected outcomes were frozen before provider calls at `2026-09-26T10:42:36.029Z`, SHA-256 `42b20e4512443e4c5013fdacbcb1bad267eb98aec6a9901d2c530ec36514d3a6`; `reports/renewal-corpus-label-freeze.json` preserves the original labels, and an offline test checks the hash.

The agreed new date contract is a bulk-renewal `targetDate` normalized to `YYYY-MM-DD`, representing the requested browser-local calendar date. Cases distinguish an added duration, an expiry selection window and a shared expiry date. Exact ISO or unambiguous full written dates are supported; missing, ambiguous, impossible, past, scheduled-execution and conflicting date/duration requests reject. Future dates in this authored set are in 2030–2033 and are evaluated relative to the recorded run date. Profile outcomes preserve the existing native shapes for same-profile Ethereum-address reuse, custom links, contact records and exact old/new values.

The prior 670 cases and 36 family development cases are exposed regression coverage; the first family reserved score stays untouched. The new 15 reserved prompts and answers were held until the final source freeze, then evaluated once. Their first result was not used for tuning or rescored after the later regression repairs. Native date controls, minimum-duration and timezone behavior have separate implementation tests and browser evidence below.

```sh
AI_EVAL_CORPUS=renewal AI_EVAL_SPLIT=development AI_EVAL_ENFORCE=1 pnpm eval:ai
AI_EVAL_CORPUS=renewal AI_EVAL_SPLIT=heldout AI_EVAL_ENFORCE=1 pnpm eval:ai
```

#### Renewal and profile-role results — 26 September 2026

**The new reserved set scored 6/15.** That is materially weaker than the development result and does not establish reliable support for arbitrary English. The labels remain identical to the frozen corpus; no rejected supported request was relabelled. The production server still uses the strict single-call parser, with candidate verification disabled.

| Evaluation | Exact outcomes | Incorrect proposals | Actual provider work and provenance |
| --- | --- | --- | --- |
| First development | 31/45 | 1 | 45 initial calls; `2026-09-26T10-53-16-051Z-renewal-development-1.json` |
| Diagnostic replay after repairs | 40/45 | 0 | Zero calls; all 45 request hashes had changed, so this is counterfactual parser diagnosis only |
| Fresh development after repairs | 43/45 | 0 | 45 changed initial requests called once; `2026-09-26T11-02-20-621Z-renewal-development-2.json` |
| First reserved | 6/15 | 0 | 15 initial calls; `2026-09-26T11-06-03-179Z-renewal-first-reserved15.json`; not rescored |
| Existing 706-case hybrid regression | 679/706 | 0 | 650 changed initial requests called once, 56 same-request dashboard captures reused; `2026-09-26T11-06-06-299Z-renewal-final706-regression.json` |
| Final parser replay of that regression | 681/706 | 0 | Zero calls; all 706 request hashes identical to their captures |
| Final parser replay of development | 43/45 | 0 | Zero calls; all 45 request hashes identical to their captures |

The first development failure silently reduced an unpin request to opening the contact editor. It remains an incorrect proposal in its original report. The repair preserves the exact `unfeature` operation and allows an editor-only fallback only for a complete opening request. Other development repairs distinguish current-expiry filters from added renewal time or a target expiry date, retain profile source/destination words during redaction, and recognize bounded typo forms without reducing confidence thresholds. The first source was `5d3d31f086bc375bdbcd3ee6c91b7330d7dd0fa1098f6dba54392dc2acf071d3`; fresh development and final live calls used `505b783024b729a5f3dd40162b34fed2cec24093a1deacab565200038a10ba86`.

On that live source, development passed all 21 canonical supported requests, three of five typo requests, six of six clarifications and 13 of 13 unsupported requests. The first reserved result passed **one of nine supported requests, one of two clarifications and four of four unsupported requests**. Combined, the new corpus scored 49/60: 25/35 supported, 7/8 clarifications and 17/17 rejections. Zero incorrect proposals were observed in these final outcomes, but safe rejection of legitimate requests remains frequent, particularly for new date and source/destination phrasing. The typo and clarification goals remain unmet.

The 706-case raw hybrid result improved from prior evidence of 672/706 to 679/706, with ten gains and three losses. One gain was a previously timed-out registration request: its initial request hash had changed and it was called once in the new batch. The old timeout remains in its original report; it was neither retried under the same request nor removed from its old denominator. Two semantic losses were deterministic regressions: “Take my favorite names through renewal” was treated as a missing date, and “Show me the address editor for coral.eth” failed the complete-opening grammar. The clipboard request's third loss depended on its new model response; its old response still passes, so that rejection cannot be attributed solely to the parser. Request wording changes and response variation are not isolated by this comparison.

Those two deterministic regressions were repaired using only exposed regression cases, with contrasts for extra actions and incomplete dates. Final source `af35cf543d92d00acf3db6966ab53496afc28a85f9a772077b86afbce968cc67` replayed all 751 stored responses with identical request hashes, zero calls and exactly two changed outcomes, both recoveries. Development remained 43/45. The new reserved 15 and prior family reserved 12 were not rescored. The immutable replay summary is `reports/renewal-final-parser-replay-summary.json`; full evidence and delivery checks are indexed in `reports/renewal-delivery-summary.json`. All raw reports and labels remain preserved.

The final regression replay passes canonical/paraphrased support at 398/410, typos at 72/83, clarifications at 88/89 and unsupported cases at 123/124. The 90% typo and complete clarification/rejection targets remain unmet. These 706 cases are exposed regression data, including previously exposed reserved rows; the report's historical split labels do not make them a new blind test. The final driver completed its safety/provider-completeness checks, not every language acceptance target. There were **755 actual initial provider calls in this pass**, zero verification calls and zero retries; browser calls are separate. The harness can now stop later batches after an incorrect proposal, preserve already completed/in-flight results and mark remaining cases unattempted instead of silently continuing.

#### Final application and native-flow verification

Final repaired-source checks passed **1,675 offline tests**: 1,568 application tests across 53 files and 107 harness tests across 12 files. Manager typecheck and build passed; lint had zero errors and 18 warnings. `git diff --check` passed and nothing was staged. A scan of all 360 built client files found no actual local TypeSafe key, secret variable name, provider hostname or model name. These are local checks, not deployment evidence.

Authenticated browser checks with real TypeSafe requests verified:

- Exact bulk names `alnila.eth` and `alnilia.eth` reached the native shared-date control with **4 July 2027** on both rows and loaded pricing at 390 × 844. A single-name written-date request reached `/renew/alnila.eth?targetDate=2027-07-04` with the same expiry. Local price snapshots were $8.83 for the two names and $4.41 for one; no purchase occurred.
- A target date below the native 28-day minimum retained the requested 20 December date and named error. The corrected invalid state hides fallback one-year pricing, presets and Next. Choosing 15 January through the existing calendar restored the native review with both dates correct and loaded pricing ($1.38 in that local snapshot).
- A negative favourite filter retained the 577-name subset, missing duration unit 31 used the targeted control, and natural same-profile Ethereum-to-Polygon reuse reached the native address editor.

Reviews were cancelled before Next, Pay, Save or signing. Final native unpin verification remains incomplete because wallet reconnect stalled after a reload; its model/preparation and offline application tests passed, which is separate evidence. Nonempty migration dependency reviews, complete V1 pricing/checkout, and several account/NFT state-change scenarios also remain open in [ACTION_COVERAGE.md](./ACTION_COVERAGE.md). No changes were committed, pushed or deployed.

### General commands

Run from `apps/manager`:

```sh
pnpm test:ai                         # Offline unit and regression tests; no provider calls
pnpm eval:ai                         # Explicit live run of all 140 cases
pnpm eval:ai:smoke                   # Explicit live run of 20 representative cases
AI_EVAL_SPLIT=development pnpm eval:ai
AI_EVAL_SPLIT=heldout pnpm eval:ai
AI_EVAL_IDS=renew-3,renew-4,edit_profile-5 pnpm eval:ai
AI_EVAL_ENFORCE=1 pnpm eval:ai        # Fail when acceptance gates are not met
AI_EVAL_LABEL=smoke-1 pnpm eval:ai:smoke
AI_EVAL_LABEL=smoke-2 pnpm eval:ai:smoke
AI_EVAL_LABEL=smoke-3 pnpm eval:ai:smoke
AI_VERIFY_CONFORMANCE=1 pnpm exec vitest run --config vitest.ai-eval.config.ts evals/ai/verification.eval.ts
```

The ordinary `pnpm test` command does not match the `.eval.ts` files. The separate Node config requires `AI_EVAL_LIVE=1` for end-to-end calls or `AI_VERIFY_CONFORMANCE=1` for direct verifier contrasts. Never add a live provider job or secret to CI. Node is deliberate: happy-dom can block provider requests, and the normal app test config replaces `process.env`.

The key is read from server-side `TYPESAFE_API_KEY`, or the ignored local `.dev.vars`. Nothing prints the key, includes it in a generated request body, or bundles the runner in the app. The only outgoing requests go directly to the same TypeSafe endpoint used by the production boundary, with the production redacted query. The runner is deliberately independent of Manager authentication and the user rate limiter: it has no user session and runs only synthetic cases locally. Authentication, rate limiting, timeout, and redaction guards have separate offline regression tests.

## Corpus and score

- 120 `/ai` cases: 80 supported (eight for each of the ten action families), 20 clarification cases, and 20 unsupported, conflicting, or negated requests.
- 20 shared My Names interpretation cases.
- 28 fixed held-out cases (20%). Tune against the development split. Evaluate the held-out split after implementation; report failures instead of moving cases to the development split or altering labels to match observed model behavior.
- Expected actions are written manually from user intent. Every ready outcome compares the complete prepared action, including names, duration, filter values, profile proposal and old value, notification preference and enabled state, and the next-action explanation when requested.
- A supported request that is rejected is a **failure**, even if rejecting it is safe. A missing value must ask for the correct field. An unsupported request succeeds only when it produces no prepared action.
- Every incorrect prepared action, including a wrong target or filter in a read-only action, counts as an incorrect proposal and must be zero for enforcement. Incorrect prepared mutations are also counted separately as unsafe proposals. No actual mutations run.

The live runner first verifies provider access with one case, then processes three cases at a time with the production eight-second timeout. HTTP 401, 403, or 429 stops further batches and marks remaining cases `not_run`; already-running requests in that batch may finish. Failures do not trigger automatic retries or disappear from the denominator unnoticed. Any provider failure or aborted evaluation makes the live command fail, even without `AI_EVAL_ENFORCE`; reports are saved before it fails. Reports separately count provider failures and observed interpretation accuracy. Model confidence is recorded for diagnosis, not treated as measured accuracy.

Acceptance goals are at least 95% exact outcomes for canonical/paraphrased supported requests, 90% for typo/shorthand requests, correct clarifications and rejections, zero incorrect proposals of any kind, and zero provider errors for a complete verification run. Those goals describe this corpus, not a universal language-understanding guarantee. Repeat the smoke set three times to observe model variability.

## Reports and baseline

Reports are written to ignored `evals/ai/reports/` as JSON and Markdown. They include case IDs, expected and actual outcomes, failure stage, answer confidence, latency, `jev-latest`, hashes of evaluated source and requests, and split/family scores. No JWT, wallet address, API key, or actual wallet name list is used.

`AI_EVAL_LABEL` identifies an experiment. For an immutable pre-change baseline, copy the production `src` tree into an ignored directory beneath Manager's `node_modules/.cache/` and set `AI_EVAL_SOURCE_ROOT` to that copied `src`. This ensures imports use the frozen source while other work continues, and bare dependencies still resolve through Manager's `node_modules`. The normal runner uses the current production source.

Do not edit the corpus to make a score look better. If a label is factually wrong or a clarification identifier changes, document the correction and compare both implementations against the corrected corpus. Keep known failures visible.

### Interpretation contract changes

The runner always obtains the model questions from the selected production source snapshot. It never injects successful answers for new questions. The added `selection_constraints` and `migration_constraints` responses therefore appear in the saved raw answers, and their instructions and criteria contribute to the request fingerprint. Older reports lack questions that did not exist in their source snapshot; their scores and saved responses remain unchanged.

Migration expectations remain exact: all eligible V1 names or a supplied positive name list, optionally excluding names requiring manager restoration. Favourite, expiry, ownership and other additional subset conditions must be rejected until a complete handoff represents them. An exclusion applying to a different clause or an explicitly skipped name must not silently become a restoration exclusion or a positive selection. A new constraint question does not change these labels or make a safe rejection of a supported request pass.

Offline regression tests check explicit unsupported, uncertain and malformed migration constraint answers, contradictory instruction polarity, native-action context conflicts and complete subset preservation. The acceptance gates still compare the whole prepared action, require the correct clarification field, reject partial support, count every wrong ready proposal, and separately fail provider outages or incomplete runs.

## Earlier original-feature verification (2026-09-26)

The frozen pre-change baseline completed all 140 cases: **91 exact outcomes (65%)**, six incorrect mutation proposals, and zero provider errors. Its report remains unchanged at `reports/2026-09-26T06-14-56-254Z-baseline.json`.

The original held-out evaluation remains **26/28 (92.86%)**, with one incorrect proposal and zero provider errors: `reports/2026-09-26T06-55-17-353Z-heldout-final.json`. Its two failures were `clarification-10` (opening General instead of asking for the missing description) and `find_names-6` (safely rejecting a supported non-expiring-name search). The deterministic missing-description clarification was fixed after this exposure. The four dashboard held-out cases had already been exposed during earlier dashboard runs. Keep these disclosures: subsequent full-corpus runs are regression checks, not new blind validation, and the split labels have not changed.

After that correction, the frozen current implementation passed all enforced acceptance gates:

| Run | Exact outcomes | Incorrect proposals | Provider failures | Report |
| --- | --- | --- | --- | --- |
| Full regression | 138/140 (98.57%) | 0 | 0 | `reports/2026-09-26T07-00-14-712Z-final-regression.json` |
| Smoke 1 | 20/20 | 0 | 0 | `reports/2026-09-26T07-01-29-465Z-final-smoke-1.json` |
| Smoke 2 | 20/20 | 0 | 0 | `reports/2026-09-26T07-01-43-435Z-final-smoke-2.json` |
| Smoke 3 | 20/20 | 0 | 0 | `reports/2026-09-26T07-01-55-189Z-final-smoke-3.json` |

The full regression scored **82/84 (97.62%)** on supported canonical/paraphrased requests, **11/11** on supported typo requests, **20/20** on clarification, and **25/25** on unsupported requests. Both remaining failures produced no prepared action: `find_names-6` ("Find names that never expire") and `bulk_renew-7` ("Renew my owned names in grace"). They remain failures in the report. The dashboard subset passed 20/20; the existing held-out labels scored 27/28 on this regression run, following the disclosed post-exposure correction.

All four final commands used `AI_EVAL_ENFORCE=1`, completed every selected case, and exited successfully. The smoke runs were sequential and used identical source, requests, and corpus labels. They are repeated checks of the same 20 cases, not 60 independent examples.

Final verification fingerprints:

- Source SHA-256, all four runs: `2f6e62ecebe97e9f90b153a012f9f91480de27f239950b20f43e0625315b6939`
- Full request SHA-256: `0269bd71278745bb4fc90cc519f638a4c716003cb223c646dd2ff991a0cec076`
- Full corpus SHA-256: `10371aa181704ba1b0581f378747c14daa9e4e6e94618ad1a788e75b77efdf38`
- Smoke request SHA-256: `372e9ff52790c857394c121e9a3c6f52f6d2bd8fb83a8231eebebd4fbba10bb3`
- Smoke corpus SHA-256: `fa07e1cad3dfd7c9c969af8975514e8cc4830c92c10851c01d87ebcf6bd30702`

An earlier provider incident returned HTTP 403 with `RBAC: access denied`; its cause was not established. Access recovered before final verification. The runner now checks access with one case, aborts later batches on access/rate-limit denial, records unattempted cases, and fails incomplete runs. Final scores exclude no provider errors because all four final runs had zero errors and zero unattempted cases.

## Fresh independent corpus before the next expansion

`freshCorpus.ts` adds **250 separately authored requests** without replacing the 140-case regression corpus: 160 supported requests (16 per existing action family), 30 clarification requests, 30 action rejections, and 30 dashboard requests (24 supported, six rejected). It includes 23 typo cases, different names and exact values, Unicode and subnames, contextual grammar, exclusions, replacements, and explicit corrections. Fifty fixed cases are held out; the remaining 200 are development cases. The fresh smoke selection has 20 cases and includes both entry points.

Select it explicitly:

```sh
AI_EVAL_CORPUS=fresh AI_EVAL_SPLIT=development pnpm eval:ai
AI_EVAL_CORPUS=fresh AI_EVAL_SPLIT=heldout pnpm eval:ai
AI_EVAL_CORPUS=fresh pnpm eval:ai:smoke
```

The first frozen-source baseline is preserved at `reports/2026-09-26T07-22-37-286Z-fresh-frozen-baseline.json`: **205/250 exact outcomes (82%)**, four incorrect prepared proposals, no provider errors and no unattempted cases. Canonical/paraphrased supported requests passed 126/161, typo requests 19/23, clarifications 25/30, and rejection requests 35/36. Development scored 166/200; the held-out aggregate was 39/50. At that baseline stage, only development failures were inspected for diagnosis; held-out case outcomes remained reserved until the final evaluation documented below.

The baseline used `/Users/yoginth/apps-monorepo/apps/manager/node_modules/.cache/ai-expansion-baseline-iaum_i7m/src`, copied before further production edits. Its source hash is `2f6e62ecebe97e9f90b153a012f9f91480de27f239950b20f43e0625315b6939`, the same implementation that scored 138/140 on the earlier tuned regression. Fresh request hash: `c05fc470f93d233449e11c611fa2d1d3b8e1ed18371df50e7b5d40fe182dbf08`. Fresh corpus hash: `dc169275fe8e6b019d4308bfb0b9430b0510d88ffbf2cf014f087266778e2ceb`.

The fresh development failures include an unrequested primary filter on a bulk renewal, a lost migration exclusion, and a generic profile editor opening instead of a targeted field question. These count as incorrect proposals even though the harness does not execute them. One rejection label merits an explicit policy review: `fresh-unsupported-14` supplies two alternative renewal durations; the original label expects rejection while the implementation asks for a duration. Clarification may be acceptable product behavior. Its original expectation and score remain unchanged rather than retroactively improving the baseline.

Eight additional offline continuation tests in `continuation.test.ts` verify that answering missing units, names, profile fields/values, notification preferences/polarity, and links preserves the other action details and replacement conditions. They also check invalid selections and stale input precedence. These pure preparation tests are separate from model accuracy and do not constitute browser verification. `pnpm test:ai` includes all evaluation `*.test.ts` files; provider calls remain opt-in.

## Separate native-action expansion corpus

`expansionCorpus.ts` adds 160 cases for the expanded capabilities without changing the legacy or fresh corpus. It contains 72 native Manager requests (three variants, including one typo, for each of 24 operations), 48 profile proposals, 20 targeted clarifications, and 20 unsupported or conflicting requests. All registered profile fields and the set, remove, feature, unfeature, use-Ethereum-address, and rename operations have exact expected proposals. Missing names, network addresses, link titles and notification values must clarify. Explicit recipients, export formats, languages, filters, channels and targets must not disappear from a prepared action.

The fixed development/held-out split is 128/32. Run development explicitly while implementing these controls:

```sh
AI_EVAL_CORPUS=expansion AI_EVAL_SPLIT=development pnpm eval:ai
```

The first expansion development call used frozen source `node_modules/.cache/ai-expansion-first-v7o9mb/src` and preserved its raw report at `reports/2026-09-26T07-35-23-436Z-expansion-development-baseline.json`: 54/128 exact outcomes, four incorrect proposals and no provider errors or source changes. One apparent mismatch was an oracle error: both Base address labels originally used mainnet coin type 2147492101, while the existing Manager picker explicitly uses Base Sepolia (84532), coin type **2147568180**. The two labels were corrected after verifying `addressPickerRecords.ts` and `getCoinTypeForReverseRegistrarChainId`; no provider call or parsing was repeated. The separately saved `...-label-correction.json` scores **55/128**, three incorrect proposals (two mutation proposals), and zero provider errors. The raw first report remains unchanged. Neither the fresh nor expansion held-out outcomes were inspected during this baseline phase.

The largest development blocker in that snapshot is the independent `manager_constraints` question vetoing native operations even when the operation classification is correct. Other observed failures include a misspelled share command routed to viewing a profile, an unpin request losing its operation, and link renaming selecting the wrong existing title. These failures remain in the saved development report for repair.

Four more offline continuation scenarios cover Manager target candidate restrictions, exact migration permissions, notification email validation, and cryptocurrency network preservation. The expansion corpus was authored before its first provider call. Subsequent capability-contract changes must be documented; do not rewrite an old rejection merely because a formerly unavailable feature has been added.

New reports use source fingerprint scope `manager-production-typescript-v2`, including production TypeScript throughout Manager's `src` rather than only AI and dashboard files. This captures the new profile registries and validators. Version 1 hashes in earlier reports are preserved and are not directly comparable with version 2 hashes. Reports record source hashes before and after a run; a source change makes the command fail after saving the report. Frozen source snapshots are preferred when other work is in progress.

Reports marked `proposalClassification: manager-native-mutation-v2` distinguish native navigation, sharing, copying and downloads from changes to Manager state, records or wallet state. Every wrong ready outcome still counts as an incorrect proposal, including those non-mutating actions, and the zero-incorrect acceptance gate is unchanged. Earlier expansion reports classified every native Manager action as a mutation; their saved counts remain untouched. In particular, the email-delivery sharing failure in development 3 is an incorrect share proposal, not a record or account mutation. Profile and native action handlers still require separate verification; the evaluation runner executes no actions.

## Expanded final verification (2026-09-26)

The final live run used frozen source `node_modules/.cache/ai-expanded-final-__vfjrfy/src`, SHA-256 `4335a8e0e9570d8e622dd19f77af5e74a6b0ecbd4464e7e56215b3c6e0d794a3`. All **550 cases** completed, with zero provider failures, zero unattempted cases and no source drift. Every command used `AI_EVAL_ENFORCE=1`; each exited unsuccessfully because one or more acceptance targets remained unmet. These results do not establish production readiness.

| Corpus | Raw exact outcomes | Development | Held out | Immutable live report |
| --- | --- | --- | --- | --- |
| Legacy | 132/140 | 105/112 | 27/28 | `reports/2026-09-26T08-11-28-359Z-expanded-final-legacy.json` |
| Fresh | 230/250 | 190/200 | 40/50 | `reports/2026-09-26T08-12-26-476Z-expanded-final-fresh.json` |
| Expansion | 152/160 | 122/128 | 30/32 | `reports/2026-09-26T08-14-02-415Z-expanded-final-expansion.json` |

Legacy held-out cases were already exposed and remain regression coverage. Fresh held-out results were inspected only at this final stage; their earlier baseline aggregate was 39/50. The expansion held-out set was first evaluated at this stage. Their first final scores, **40/50** and **30/32**, remain preserved. Any later use of these cases is regression testing rather than fresh blind validation.

One raw expansion comparison flagged a mutation proposal because its expected shape predated the new explicit notification scope. `expansion-mark_notifications_read-2` asks to clear the unread status of loaded inbox notifications. The new prepared action correctly contains `notificationTag: 'all'` and `unreadOnly: true`; the old label omitted those fields. Only that expected shape was updated, with a source comment. A separate offline rescore of the stored outcome, with no provider call or parser rerun, is saved at `reports/2026-09-26T08-14-02-415Z-expanded-final-expansion-contract-adjusted.json`: **153/160**, zero incorrect proposals and zero unsafe proposals. This is contract maintenance, not a model accuracy improvement. The raw report is unchanged. Legacy `unsupported-9` also reflects earlier capability scope: Bitcoin record editing now asks for a missing name and exact address. Its old rejection label and raw score remain unchanged.

After that contract audit, there were **zero confirmed wrong ready proposals across the 550 observed cases**. Supported requests still failed through rejection, invalid preparation or incorrect clarification. Fresh canonical/paraphrased requests scored 145/161 (90.06%), typos 20/23 (86.96%) and clarifications 29/30. Contract-adjusted expansion scored 89/93 (95.70%) on canonical/paraphrased requests, 26/27 (96.30%) on typos, and 18/20 clarifications. Missing thresholds remain visible; no failed supported case was relabelled as a valid rejection.

### Subsequent browser fix and offline replay

The browser then exposed a rejected request, “Renew my V2 names for 69 days.” One separate live diagnostic reproduced it in `reports/2026-09-26T08-17-26-352Z-browser-v2-renew69-diagnostic.json`. Offline ablation proved the uncertain `selection_constraints` response was the sole blocker; changing only expiry confidence did not help. The parser now recognizes the complete literal version-selection grammar only when the selected version and every other facet agree, while retaining unsupported, malformed, extra-condition and polarity checks. No global confidence threshold changed.

All 550 stored responses were replayed against the updated frozen parser, SHA-256 `d2d1e9ca610c663c8b16a14acc87104dad8c0ba0be8996b6ddd2450061ea23d7`. The request hashes were identical to the live run. There were **zero changed prepared outcomes** and zero new provider calls; the only score change was the documented notification expected-shape correction. See `reports/expanded-offline-parser-replay-summary.json`. These replay counts are not a new live evaluation. The separately captured 69-day response has an offline regression, and the corrected request subsequently reached native bulk renewal with 69-day pricing in the authenticated browser.

Final checks passed **966 offline tests**: 915 application tests plus 51 evaluation-harness tests, across 43 files. Manager typecheck and build passed. Lint had zero errors and 15 warnings. A scan of 360 generated client files found no actual TypeSafe secret, secret variable name, provider endpoint or model name.

Final browser checks also covered notification email prefill, the already-disabled push state, the exact wrapped-name migration approval, minted NFT viewing, a location proposal in the existing profile editor, and the launcher at 390 px width. A scoped expiry-notification mark-read request still safely rejected and remains a limitation. No profile save, notification save, wallet signing or transaction was performed during these checks. Nothing was committed, pushed or deployed.

## Independent robustness coverage after the 550-case regression

`robustnessCorpus.ts` adds 80 independently authored requests focused on collection search, bulk renewal, migration subsets, notification categories and profile/link clarification. It contains 48 supported outcomes, eight targeted clarifications and 24 unsupported or conflicting requests, including seven typo cases and four dashboard requests. Full expected outcomes preserve exact names, selected filters, durations, replacement values, link targets and notification scope. Previous corpus labels remain unchanged.

The fixed split is 64 development cases and 16 reserved cases, with every fifth request reserved. The 16-case smoke selection contains development cases only. All earlier 550 requests are now exposed regression data. Some new prompt text appeared incidentally in formatter output seen by the implementation agent; no reserved response or score has been inspected or used for tuning. The first reserved result below is an untuned first outcome with that exposure disclosed; the prompt text was not completely unseen.

```sh
AI_EVAL_CORPUS=robustness AI_EVAL_SPLIT=development pnpm eval:ai
AI_EVAL_CORPUS=robustness AI_EVAL_SPLIT=heldout AI_EVAL_ENFORCE=1 pnpm eval:ai
```

The first development baseline is preserved at `reports/2026-09-26T08-42-19-394Z-robustness-development-1.json`: **48/64 exact outcomes**, zero incorrect or unsafe ready proposals, zero provider errors and no source drift. Its frozen source SHA-256 is `8ac1ac5ad7fb08680cd1531d8109a25ece09ff79f9ac083f72eb950bb3f61b66`. Canonical/paraphrased supported requests passed 23/36, typo requests 1/3, clarifications 5/6, and unsupported requests 19/19. `AI_EVAL_ENFORCE=1` failed because the support and clarification targets were unmet. At that baseline stage, the 16 reserved cases were uncalled; no failed supported case was relabelled. All 55 offline harness tests passed. Offline census and selection tests verify the split and prevent accidental overlap with the previous 550 cases. A separate single synthetic notification diagnostic reproduced the scoped mark-read rejection: the selected expiry category was confident, while the optional unread-only flag was uncertain. Its original response is preserved at `reports/2026-09-26T08-32-11-775Z-browser-expiry-read-diagnostic.json`. A later offline parser replay reached the exact requested expiry-only review with no provider call; this is a regression check, not another live score.

The later explicit notification-scope contract also applies to `expansion-mark_notifications_read-1` (all loaded unread notifications: `all` / `true`) and `expansion-mark_notifications_read-3` (loaded notifications, no unread-only filter: `all` / `false`). Those two expected shapes were updated after checking the literal requests, independently of model accuracy; no other label changed. The two development-failure subset reports at 08:43:15 and 08:48:22 remain raw **2/5** with one flagged shape mismatch. Separate `-scope-contract-adjusted.json` artifacts rescore only their stored outcomes to **3/5**, zero incorrect proposals, without provider calls or production parsing. The original 550-case reports remain unchanged.

A second development run, `reports/2026-09-26T08-48-01-476Z-robustness-development-2.json`, used source `1ee2bef58198aa687bf8fed80c37cfb995c0308489b64ffa497a0270d3ddc114`: **54/64**, zero provider errors, but **two incorrect read-only proposals**. Both added an upgrade-eligibility filter to past-grace requests that had not asked for it. They count as incorrect even though the runner executed no action; this run failed the zero-incorrect gate. The first development baseline remains unchanged. This snapshot preceded later profile and facet-evidence repairs, and its result must not be represented as those repairs' verification.

### Latest frozen verification and remaining defects

The subsequent frozen source at `node_modules/.cache/ai-robustness-final-vgq7o365/src`, SHA-256 `60462d98316b5ee3d4bbb30672e08de29ee90b1a55462d30675b907928f0b86c`, scored **58/64 development** (`2026-09-26T08-52-47-815Z-robustness-final-development.json`) with zero incorrect proposals. Its first reserved run scored **10/16** (`2026-09-26T08-53-19-435Z-robustness-first-reserved.json`), also with zero incorrect proposals. Combined, the new 80 cases scored **68/80**, with eight of eight clarifications and 24 of 24 unsupported cases passing. Canonical/paraphrased supported requests passed 34/42 and typo supported requests 2/6. These support thresholds remain unmet. The reserved results were first inspected at this stage and must remain labelled as first untuned outcomes; future use is regression testing.

The same source's legacy regression scored **133/140**, with **one incorrect mutation proposal**, in `2026-09-26T08-54-14-783Z-robustness-final-legacy-regression.json`. A three-action registration/primary/favourite request was reduced to the first two actions. Its low-confidence `many` classification was not rejected by the count guard. Further fresh and expansion provider batches were stopped when this defect appeared. All completed runs had zero provider errors, zero unattempted cases and no source drift; every enforced command failed an acceptance gate. These raw reports remain unchanged.

The three-action guard was then repaired without changing model questions. All 220 stored responses from the latest 64 development, 16 reserved and 140 legacy runs were replayed offline against source `6c12aaf3c1e4b47cb273384cb1e2ef2fb7a0248bac75d2743c5be5fd6f3ad8dc`, with no provider calls. Request hashes were identical. Exactly one prepared outcome changed: the three-action request now rejects. Development remains 58/64, reserved remains 10/16, and legacy replay becomes 134/140, with zero incorrect proposals. See `reports/robustness-final-many-action-replay-summary.json`. The live legacy score remains 133/140; the replay does not replace it or constitute another live evaluation.

The remaining live regressions then completed on the repaired parser, with no source changes or provider errors:

| Current-parser coverage | Exact outcomes | Evidence |
| --- | --- | --- |
| Robustness development | 58/64 | Stored-response replay; original live result unchanged |
| Robustness first reserved | 10/16 | Stored-response replay; first reserved score unchanged |
| Legacy regression | 134/140 | Stored-response replay; original live score 133/140 |
| Fresh regression | 235/250 | New live report `2026-09-26T08-58-24-732Z-robustness-final-fresh-regression.json` |
| Expansion regression | 155/160 | New live report `2026-09-26T08-59-53-629Z-robustness-final-expansion-regression.json` |

This is **592/630 exact outcomes** from **410 new live cases plus 220 stored-response replays**, with zero incorrect or unsafe ready proposals on the current parser. It is not a single 630-case live or blind evaluation. The summary artifact is `reports/robustness-current-parser-verification-summary.json`. All previous raw failures, original held-out scores and documented contract corrections are retained. The first 16 reserved outcomes are now exposed and any future use is regression testing.

The live fresh regression still missed the required targets: canonical/paraphrased 151/161, typos 20/23, clarifications 29/30 and unsupported requests 35/36. Expansion met canonical/paraphrased 90/93, typo 26/27 and rejection 20/20 targets, but clarification 19/20 missed its 100% requirement. Both enforced live commands exited unsuccessfully. Rejections of legitimate requests and incomplete clarification remain material limitations; these scores do not establish universal language support or production readiness.

After this repair, final application checks passed **1,076 offline tests**: 1,021 application tests plus 55 harness tests. Typecheck, build and lint passed; lint retained 15 warnings. The fresh scan of 360 client files again found no actual local secret, secret key name, provider hostname or model name. This supersedes the 1,068-test application check below while preserving its history.

A subsequent formatter-only change to `jevNameSearch.ts` was inspected separately: it wraps one regex `.test(query)` call and adds a trailing argument comma. No other production file differed at that check. The preserved comparison is `reports/robustness-final-format-delta.json`; no provider rerun was made for formatting alone.

Application verification at this stage passed **1,068 offline tests**: 1,013 application tests plus 55 harness tests. Manager typecheck and build passed; lint had zero errors and 15 warnings. A scan of 360 client files found no actual local secret, secret key name, provider hostname or model name. Authenticated browser checks confirmed that a leading-target GitHub replacement opened the existing editor with the replacement handle, then Cancel left it unsaved. A request for one notification category opened a category picker; choosing Expiry continued to `/notifications?unread=false&tag=expiry`. No save, notification mutation or wallet signing occurred. These checks do not negate the live evaluation defects above.

Subsequent authenticated browser verification reached the native expiry-only mark-read review with zero loaded unread notifications and its submit button disabled; nothing was marked read. A V2 search using a written forty-five-day window also reached the matching-names view. These are separate browser observations and do not replace the corpus results above.

## Earlier browser and application verification

Chrome checks used a connected, backend-authenticated wallet and real TypeSafe requests:

- A typo-heavy ten-day renewal request reached review. A missing duration unit used the targeted selector; ten weeks became 70 days. Closing review returned to the prompt.
- The exact primary-name request opened the existing selector with the requested name selected, including a name beyond its initial 100 results. Its confirmation was disabled because the name was already primary.
- A GitHub replacement request opened the existing editor with the new handle prefilled. Cancelling preserved the old public record.
- An available registration reached loaded pricing with `durationDays=69`, nine weeks and six days, and the resulting expiry date. A taken name showed an unavailable message.
- V2 renewal reached loaded pricing with `durationDays=10`, one week and three days, and ten days added to the current expiry. An earlier `ERR_BLOCKED_BY_CLIENT` navigation failure did not recur during this successful check.
- V1 renewal routed to `/renew-v1/...` with the requested ten-day prefill. The existing flow rejected the available V1 fixture as migrated, unreserved, or outside its renewal window. Successful V1 checkout pricing remains unverified with this wallet.
- V1 and V2 name searches returned the corresponding loaded sets with pagination. “Renew those names” retained the previous filters and passed the eligible V2 set into the existing bulk renewal dialog, where pricing finished loading. The V1-only set correctly had no names eligible for this V2 bulk flow.
- Migration opened with the manager-restoration exclusion preset. Fresh eligibility returned no eligible names for this wallet, so live dependency-conflict and nonempty-subset behavior could not be exercised; their deterministic handoff and selection rules have unit coverage.
- Notification requests opened the settings page with the proposed preference; saving remained disabled without a verified contact method. Favourite requests stopped at a confirmation button. Profile navigation opened the exact requested name.
- My Names retained immediate literal search, the Enter hint and loading state, removable interpreted chips, and bulk selection across filtered pagination. Removing the last chip reset the phrase search. Switching between Owned and Favorites cleared the active interpreted filters and search text.
- The launcher and review/error dialog were checked at desktop and 390 px mobile widths. Provider failure displayed an unavailable explanation. Authentication, missing-secret, timeout and rate-limit failures are covered by offline boundary tests; those states were not all induced in the signed-in browser.

One browser request, “Renew my V2 names,” was rejected. A separate diagnostic call on the same source succeeded with intent confidence 0.56, close to the existing 0.55 threshold. The exact rejected response was not captured, so model variability is a likely explanation, not a proven cause. This observation remains a limitation alongside the two corpus failures.

`pnpm test:ai` passed **486 tests** (458 application tests and 28 runner tests). Manager typecheck, lint, build and `git diff --check` passed. Lint reported 13 warnings. The build retained its existing route-test/chunk advisories. A scan of 357 generated client files found zero occurrences of the actual local TypeSafe secret, its environment variable name, provider hostname/endpoint, or model name.

No wallet transaction, payment, profile record change, notification save, or favourite mutation was submitted. No changes were committed or pushed.
